import io
import sqlite3
import threading

import pytest
from openpyxl import Workbook
from sqlalchemy import create_engine, text

import db as db_module
from roster import MAX_ROWS, clean_name, name_key, normalize_phone, read_contacts

RAHUL = "9876543210"
AMIT = "9988776655"
SID = "9000011111"


def raw_upload(client, headers, content, filename="c.csv", dry_run=False):
    if isinstance(content, str):
        content = content.encode()
    return client.post(f"/contacts/upload?dry_run={str(dry_run).lower()}", headers=headers, files={"file": (filename, content)})


def upload(client, headers, content, filename="c.csv", dry_run=False):
    _premium(client, headers)  # bulk upload is premium
    return raw_upload(client, headers, content, filename, dry_run)


def add(client, headers, name, phone=None):
    return client.post("/contacts", headers=headers, json={"name": name, "phone": phone})


def names(client, headers):
    return [c["name"] for c in client.get("/contacts", headers=headers).json()]


def xlsx(rows):
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def booking(client, headers, ground, players, **extra):
    return client.post("/bookings", headers=headers, json={
        "ground_id": ground, "play_date": "2026-11-01", "start_time": "07:00", "duration_min": 60,
        "rate_per_hour": 1000, "players": players, **extra,
    })


# ---------- name rules ----------

@pytest.mark.parametrize("a,b", [
    ("Rahul", "rahul"), ("Rahul", "RAHUL"), ("Rahul Kumar", "Rahul   Kumar"), ("Rahul", " Rahul "), ("R. Sharma", "R Sharma"),
    ("Rahul", "Ra​hul"), ("Rahul", "Ｒａｈｕｌ"), ("Strauß", "STRAUSS"), ("O'Brien", "O’Brien"), ("Rahul", "Rahul."),
])
def test_same_name(a, b):
    assert name_key(a) == name_key(b)


@pytest.mark.parametrize("a,b", [("Rahul", "Rahul K"), ("Rahul", "Rahul 2"), ("राहुल", "रहुल"), ("Ganesh", "Ganesh +1")])
def test_different_name(a, b):
    assert name_key(a) != name_key(b)


def test_clean_name_keeps_what_tells_people_apart():
    assert clean_name("Rahul 2") == "Rahul 2"
    assert clean_name("राहुल") == "राहुल"  # vowel signs must survive
    assert clean_name("1. Rahul") == "Rahul"
    assert clean_name("Rahul 98765 43210") == "Rahul"
    assert clean_name("Rahul +91 98765 43210") == "Rahul"
    assert clean_name("=HYPERLINK(1)") == "Hyperlink 1"
    assert clean_name("12345") == clean_name("🏏") == clean_name("   ") == clean_name(None) == ""


@pytest.mark.parametrize("raw,expected", [
    ("+91 98765 43210", RAHUL), ("098765-43210", RAHUL), ("0091 9876543210", RAHUL), (9876543210, RAHUL), (9876543210.0, RAHUL),
    ("919876543210", RAHUL), ("12345", None), ("98765432101234", None), ("", None), (None, None),
    (float("inf"), None), (float("nan"), None), (9876543210.5, None), ("9.87654E+09", None),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["Amit ❤️", "Amit\ufe0f", "1️⃣ Amit", "Amit 🏏"])
def test_emoji_leftovers_dont_make_a_new_name(raw):
    assert clean_name(raw) == "Amit" and name_key(clean_name(raw)) == "amit"
    assert name_key("Amit ❤️") == "amit"


def test_only_real_mobile_numbers_can_be_added(client, host):
    assert add(client, host, "Fake", "1234567890").status_code == 400
    assert upload(client, host, "Name,Phone\nFake,1234567890\n").json()["rejected"][0]["reason"].startswith("Not a valid")


# ---------- single contacts ----------

def test_duplicate_name_refused_every_way(client, host):
    assert add(client, host, "Rahul", RAHUL).status_code == 200
    for twin in ("Rahul", "rahul", "  RAHUL  ", "Rahul.", "Ra​hul"):
        res = add(client, host, twin, AMIT)
        assert res.status_code == 409, twin
        assert "already saved" in res.json()["detail"]
    assert names(client, host) == ["Rahul"]


def test_duplicate_number_refused(client, host):
    add(client, host, "Rahul", RAHUL)
    res = add(client, host, "Amit", "+91 98765 43210")
    assert res.status_code == 409 and "Rahul" in res.json()["detail"]


def test_rename_onto_taken_name_refused_but_recase_allowed(client, host):
    add(client, host, "Rahul")
    amit = add(client, host, "Amit").json()
    assert client.patch(f"/contacts/{amit['id']}", headers=host, json={"name": "RAHUL"}).status_code == 409
    assert client.patch(f"/contacts/{amit['id']}", headers=host, json={"name": "AMIT"}).status_code == 200


def test_hidden_contact_still_holds_its_name(client, host):
    c = add(client, host, "Rahul").json()
    client.patch(f"/contacts/{c['id']}", headers=host, json={"archived": True})
    res = add(client, host, "Rahul")
    assert res.status_code == 409 and "hidden" in res.json()["detail"]


@pytest.mark.parametrize("name", ["   ", "12345", "🏏", "..."])
def test_name_needs_a_letter(client, host, name):
    assert add(client, host, name).status_code == 400


def test_long_name_cut_and_still_unique(client, host):
    assert add(client, host, "A" * 120, RAHUL).status_code == 200
    assert add(client, host, "A" * 121, AMIT).status_code == 422
    assert add(client, host, "a" * 120, AMIT).status_code == 409


def test_bad_number_and_clearing_number(client, host):
    assert add(client, host, "Rahul", "12345").status_code == 400
    c = add(client, host, "Rahul", RAHUL).json()
    assert client.patch(f"/contacts/{c['id']}", headers=host, json={"phone": ""}).json()["phone"] is None


def test_delete_only_without_history(client, host, ground):
    free = add(client, host, "Free").json()
    assert client.delete(f"/contacts/{free['id']}", headers=host).status_code == 200
    booking(client, host, ground, [{"name": "Played", "phone": RAHUL}])
    played = next(c for c in client.get("/contacts", headers=host).json() if c["name"] == "Played")
    assert played["has_history"] and played["games"] == 1
    assert client.delete(f"/contacts/{played['id']}", headers=host).status_code == 409


# ---------- hosts are separate ----------

def test_hosts_dont_share_names_or_contacts(client, signup):
    one, two = signup(), signup()
    c = add(client, one, "Rahul", RAHUL).json()
    assert add(client, two, "Rahul", RAHUL).status_code == 200  # same person, two hosts
    assert client.patch(f"/contacts/{c['id']}", headers=two, json={"name": "Stolen"}).status_code == 404
    assert client.delete(f"/contacts/{c['id']}", headers=two).status_code == 404
    assert len(client.get("/contacts", headers=two).json()) == 1


@pytest.mark.parametrize("method,path", [
    ("get", "/contacts"), ("post", "/contacts"), ("post", "/contacts/upload"), ("patch", "/contacts/1"), ("delete", "/contacts/1"),
])
def test_login_required(client, method, path):
    assert getattr(client, method)(path).status_code == 401


# ---------- bulk upload ----------

def test_dry_run_saves_nothing_and_matches_real_run(client, host):
    sheet = f"Name,Phone\nRahul,{RAHUL}\nAmit,{AMIT}\n"
    preview = upload(client, host, sheet, dry_run=True).json()
    assert preview["added"] == 2 and preview["dry_run"]
    assert names(client, host) == []
    real = upload(client, host, sheet).json()
    assert {k: real[k] for k in ("added", "filled", "skipped")} == {k: preview[k] for k in ("added", "filled", "skipped")}
    assert names(client, host) == ["Amit", "Rahul"]


def test_upload_twice_changes_nothing(client, host):
    sheet = f"Name,Phone\nRahul,{RAHUL}\nAmit,\n"
    upload(client, host, sheet)
    res = upload(client, host, sheet).json()
    assert (res["added"], res["skipped"], res["rejected"]) == (0, 2, [])


def test_every_bad_row_named_good_rows_saved(client, host):
    add(client, host, "Saved", SID)
    add(client, host, "Taken", "9111111111")
    sheet = (
        "Name,Phone\n"
        f"Good,{RAHUL}\n"            # 2 saved
        f"good,{AMIT}\n"             # 3 same name, other number
        "NoPhone Guy,12345\n"        # 4 bad number
        f",9222222222\n"             # 5 no name
        f"Other,{SID}\n"             # 6 number belongs to Saved
        "Taken,9333333333\n"         # 7 name saved with another number
        f"Twin,{RAHUL}\n"            # 8 number repeated in file
        f"Saved,{SID}\n"             # 9 exact match: skip
    )
    res = upload(client, host, sheet).json()
    assert res["added"] == 1 and res["skipped"] == 1
    by_line = {r["line"]: r["reason"] for r in res["rejected"]}
    assert set(by_line) == {3, 4, 5, 6, 7, 8}
    assert "different numbers" in by_line[3] and "valid" in by_line[4] and "missing" in by_line[5]
    assert "Saved" in by_line[6] and "…1111" in by_line[7] and "Good" in by_line[8]
    assert sorted(names(client, host)) == ["Good", "Saved", "Taken"]


def test_file_fills_a_missing_number(client, host):
    add(client, host, "Rahul")
    res = upload(client, host, f"Name,Phone\nrahul,{RAHUL}\nRAHUL,{RAHUL}\n").json()
    assert (res["filled"], res["skipped"]) == (1, 1)
    assert client.get("/contacts", headers=host).json()[0]["phone"] == RAHUL


def test_two_rows_cant_fill_one_contact_with_different_numbers(client, host):
    add(client, host, "Rahul")
    res = upload(client, host, f"Name,Phone\nRahul,{RAHUL}\nRahul,{AMIT}\n").json()
    assert res["filled"] == 1 and len(res["rejected"]) == 1


def test_csv_quirks(client, host):
    res = upload(client, host, f'﻿Name,Phone\r\n"Sharma, Rahul",{RAHUL}\r\n\r\n,\r\n').json()
    assert res["added"] == 1 and names(client, host) == ["Sharma Rahul"]


@pytest.mark.parametrize("content", [
    f"Name;Phone\nRahul;{RAHUL}\n".encode(),
    f"Name\tPhone\nRahul\t{RAHUL}\n".encode("utf-16"),
    f"Name,Phone\nRené,{RAHUL}\n".replace("René", "Rahul").encode("cp1252"),
    f"Rahul,{RAHUL}\n".encode(),
    f"Rahul {RAHUL}\n".encode(),
    f"Sunday squad\nName,Mobile No\nRahul,{RAHUL}\n".encode(),
    f"Sr. No.,Name,Phone\n1,Rahul,{RAHUL}\n".encode(),
    f"Contact Name,Contact\nRahul,{RAHUL}\n".encode(),
    f"First Name,Last Name,Phone 1 - Label,Phone 1 - Value\nRahul,,Mobile,{RAHUL}\n".encode(),
    f"Home Phone,Mobile Phone,Name\n,{RAHUL},Rahul\n".encode(),
])
def test_file_shapes(client, host, content):
    res = upload(client, host, content)
    assert res.status_code == 200, res.text
    assert res.json()["added"] == 1, res.json()
    contact = client.get("/contacts", headers=host).json()[0]
    assert (contact["name"], contact["phone"]) == ("Rahul", RAHUL)


@pytest.mark.parametrize("sheet", [
    f"No,Name,Phone\n1,Rahul,{RAHUL}\n",
    f"Jersey No,Name,Phone\n7,Rahul,{RAHUL}\n",
    f"S.No,Player's Name,Player's Number\n1,Rahul,{RAHUL}\n",
    f"FirstName,LastName,MobileNumber\nRahul,,{RAHUL}\n",
    f"FullName,PhoneNumber\nRahul,{RAHUL}\n",
    f"name,phoneno\nRahul,{RAHUL}\n",
    f"First_Name,Mobile_No\nRahul,{RAHUL}\n",
])
def test_header_shapes(sheet):
    rows = read_contacts("c.csv", sheet.encode())
    assert len(rows) == 1 and rows[0]["name"].strip() == "Rahul" and rows[0]["phone"] == RAHUL


def test_person_who_looks_like_a_heading():
    rows = read_contacts("c.csv", f"Sid (no number),\nRahul,{RAHUL}\n".encode())
    assert [normalize_phone(r["phone"]) for r in rows] == [None, RAHUL] and rows[1]["name"] == "Rahul"


def test_number_only_heading_still_works():
    assert read_contacts("c.csv", f"Mobile\n{RAHUL}\n{AMIT}\n".encode())[0]["phone"] == RAHUL


def test_row_that_looks_like_a_header_isnt_lost():
    assert read_contacts("c.csv", f"Naamdev,{RAHUL}\nAmit,{AMIT}\n".encode())[0]["name"] == "Naamdev"


def test_xlsx_numeric_phones_and_row_numbers(client, host):
    content = xlsx([["Name", "Phone"], ["Rahul", 9876543210], [None, None], ["Bad", 12345]])
    res = upload(client, host, content, "c.xlsx").json()
    assert res["added"] == 1 and res["rejected"][0]["line"] == 4


def test_vcard(client, host):
    card = (
        "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Rahul K\r\nTEL;TYPE=HOME:022 2222 2222\r\nTEL;TYPE=CELL:+91 98765 43210\r\nEND:VCARD\r\n"
        "BEGIN:VCARD\r\nVERSION:2.1\r\nN:Kumar;Amit;;;\r\nitem1.TEL:9988776655\r\nEND:VCARD\r\n"
        "BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E0=A4=B0=E0=A4=BE=E0=A4=B9=E0=A5=81=E0=A4=B2\r\nEND:VCARD\r\n"
        "BEGIN:VCARD\r\nVERSION:3.0\r\nTEL:9000011111\r\nEND:VCARD\r\n"
    )
    res = upload(client, host, card, "contacts.vcf").json()
    assert res["added"] == 3 and len(res["rejected"]) == 1
    saved = {c["name"]: c["phone"] for c in client.get("/contacts", headers=host).json()}
    assert saved == {"Rahul K": RAHUL, "Amit Kumar": AMIT, "राहुल": None}


def test_vcard_good_number_beats_bad_and_mobile_type_counts():
    card = "BEGIN:VCARD\nFN:A\nTEL;TYPE=HOME:022 2222 2222\nTEL;TYPE=VOICE:9876543210\nEND:VCARD\n"
    card += "BEGIN:VCARD\nFN:B\nTEL;TYPE=WORK:9111111111\nTEL;TYPE=MOBILE:9988776655\nEND:VCARD\n"
    assert [r["phone"] for r in read_contacts("c.vcf", card.encode())] == [RAHUL, AMIT]


def test_vcard_photo_doesnt_swallow_the_next_line():
    card = "BEGIN:VCARD\r\nFN:A\r\nPHOTO;ENCODING=b:AAAA==\r\nTEL;TYPE=CELL:9876543210\r\nEND:VCARD\r\n"
    assert read_contacts("c.vcf", card.encode())[0]["phone"] == RAHUL


def test_vcard_quoted_printable_wrapped_over_lines():
    card = "BEGIN:VCARD\r\nFN;ENCODING=QUOTED-PRINTABLE:=E0=A4=B0=\r\n=E0=A4=BE\r\nEND:VCARD\r\n"
    assert read_contacts("c.vcf", card.encode())[0]["name"] == "रा"


@pytest.mark.parametrize("filename,content,detail", [
    ("c.pdf", b"x", "Upload an"),
    ("c.xls", b"x", "Upload an"),
    ("c.xlsx", b"not a zip", "Couldn't read"),
    ("c.csv", b"", "No contacts"),
    ("c.csv", b"Name,Phone\n", "No contacts"),
    ("c.vcf", b"no cards here", "No contacts"),
    ("c.csv", b"x" * 2_000_001, "too large"),
    ("../../etc/passwd.csv", b"Name,Phone\n", "No contacts"),
])
def test_bad_files(client, host, filename, content, detail):
    res = upload(client, host, content, filename)
    assert res.status_code == 400 and detail in res.json()["detail"]


def test_too_many_rows_refused_whole(client, host):
    rows = "".join(f"P{i},\n" for i in range(MAX_ROWS + 1))
    res = upload(client, host, f"Name,Phone\n{rows}")
    assert res.status_code == 400 and "more than" in res.json()["detail"]
    assert names(client, host) == []


def test_html_in_a_sheet_is_neutralised(client, host):
    res = upload(client, host, f'Name,Phone\n"<script>alert(1)</script>",{RAHUL}\n').json()
    assert res["added"] == 1 and "<" not in names(client, host)[0]


def test_one_upload_only_touches_its_own_host(client, signup):
    one, two = signup(), signup()
    add(client, two, "Rahul", RAHUL)
    assert upload(client, one, f"Name,Phone\nRahul,{AMIT}\n").json()["added"] == 1


# ---------- bookings, Dugout and Scorebook follow the same rule ----------

def test_booking_same_name_other_number_refused_and_nothing_saved(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    res = booking(client, host, ground, [{"name": "Amit", "phone": AMIT}, {"name": "rahul", "phone": SID}])
    assert res.status_code == 409 and "Rahul" in res.json()["detail"] and "3210" in res.json()["detail"]
    assert names(client, host) == ["Rahul"]  # Amit not half-saved
    assert client.get("/bookings", headers=host).json() == []


def test_booking_lists_every_clash_at_once(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    add(client, host, "Amit", AMIT)
    res = booking(client, host, ground, [{"name": "Rahul", "phone": SID}, {"name": "Amit", "phone": "9111111111"}])
    assert "Rahul" in res.json()["detail"] and "Amit" in res.json()["detail"]


def test_two_new_people_same_name_in_one_booking_refused(client, host, ground):
    res = booking(client, host, ground, [{"name": "Rahul", "phone": RAHUL}, {"name": "Rahul", "phone": AMIT}])
    assert res.status_code == 409
    assert names(client, host) == []


def test_booking_reuses_saved_contact_by_name_or_number(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    res = booking(client, host, ground, [{"name": "RAHUL"}, {"name": "Someone Else", "phone": AMIT}])
    assert res.status_code == 200
    add_by_phone = booking(client, host, ground, [{"name": "Rahul Kumar", "phone": RAHUL}])
    assert add_by_phone.json()["entries"][0]["name"] == "Rahul"
    assert sorted(names(client, host)) == ["Rahul", "Someone Else"]


def test_booking_attaches_a_number_to_a_nameonly_contact(client, host, ground):
    add(client, host, "Rahul")
    booking(client, host, ground, [{"name": "Rahul", "phone": RAHUL}])
    assert client.get("/contacts", headers=host).json()[0]["phone"] == RAHUL


def test_number_attached_earlier_in_the_same_list_is_seen(client, host, ground):
    add(client, host, "Sid")
    res = booking(client, host, ground, [{"name": "Sid", "phone": SID}, {"name": "Siddharth", "phone": SID}, {"name": "Amit"}])
    assert res.status_code == 200 and res.json()["tally"]["players"] == 2


def test_one_person_twice_doesnt_leave_the_host_short(client, host, ground):
    res = booking(client, host, ground, [{"name": "Rahul", "phone": RAHUL}, {"name": "Rahul"}, {"name": "Amit"}])
    assert res.json()["tally"]["players"] == 2
    assert res.json()["tally"]["target"] == 1000  # two shares of ₹500, not two of ₹334


def test_rahul_2_is_a_different_player_in_a_booking(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    add(client, host, "Rahul 2", AMIT)
    res = booking(client, host, ground, [{"name": "Rahul 2"}])
    assert res.json()["entries"][0]["phone"] == AMIT


def test_nameless_numbers_ending_alike_are_two_people(client, host, ground):
    res = booking(client, host, ground, [{"name": "Player 3210", "phone": RAHUL}, {"name": "Player 3210", "phone": "9123453210"}])
    assert res.status_code == 200 and res.json()["tally"]["players"] == 2


def test_blank_player_refused(client, host, ground):
    assert booking(client, host, ground, [{"name": "   "}]).status_code == 400


def _dugout_name(client, vault, name, phone=None):
    game = {"ground_name": "Ramp", "play_date": "2026-11-01", "start_time": "07:00", "duration_min": 60}
    return client.post("/teamsheet/games", headers=vault, json={**game, "players": [{"name": name, "phone": phone, "amount": 100}]})


def test_editing_a_number_leaves_a_dugout_name_alone(client, host):
    vault = _premium(client, host)
    _dugout_name(client, vault, "Ganesh +1")
    c = client.get("/contacts", headers=host).json()[0]
    res = client.patch(f"/contacts/{c['id']}", headers=host, json={"name": "Ganesh +1", "phone": RAHUL})
    assert res.json()["name"] == "Ganesh +1" and res.json()["phone"] == RAHUL


def test_older_number_doesnt_block_a_rename(client, host):
    c = add(client, host, "Old").json()
    from db import SessionLocal
    from models import Player

    with SessionLocal() as db:
        db.get(Player, c["id"]).phone = "5551234567"
        db.commit()
    res = client.patch(f"/contacts/{c['id']}", headers=host, json={"name": "Older", "phone": "5551234567"})
    assert res.status_code == 200 and res.json()["name"] == "Older"
    assert client.patch(f"/contacts/{c['id']}", headers=host, json={"phone": "5551234568"}).status_code == 400


def test_add_players_to_booking_refuses_clash(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    b = booking(client, host, ground, [{"name": "Amit", "phone": AMIT}]).json()
    res = client.post(f"/bookings/{b['id']}/players", headers=host, json={"players": [{"name": "Rahul", "phone": SID}]})
    assert res.status_code == 409


def test_organizer_with_same_name_as_a_listed_player(client, host, ground):
    res = booking(client, host, ground, [{"name": "Host"}, {"name": "Amit"}], include_organizer=False)
    assert res.status_code == 200
    settings = client.get("/settings", headers=host).json()
    client.put("/settings", headers=host, json={**settings, "organizer_name": "Amit"})
    res = booking(client, host, ground, [{"name": "Amit"}, {"name": "Sid"}], include_organizer=True)
    assert res.json()["tally"]["players"] == 2 and res.json()["tally"]["target"] == 1000


def _premium(client, host):
    from models import Host
    from db import SessionLocal

    me = client.get("/auth/me", headers=host).json()
    with SessionLocal() as db:
        db.get(Host, me["id"]).role = "premium"
        db.commit()
    return {**host, "X-Tufger-Key": "test-key"}


@pytest.mark.parametrize("dry_run", [True, False])
def test_normal_host_cant_bulk_upload(client, host, dry_run):
    res = raw_upload(client, host, "Rahul,9876543210\n", dry_run=dry_run)
    assert res.status_code == 402 and "Premium" in res.json()["detail"]
    assert names(client, host) == []


def test_normal_host_keeps_the_rest_of_the_contact_book(client, host):
    assert add(client, host, "Rahul", RAHUL).status_code == 200
    assert names(client, host) == ["Rahul"]


def test_premium_needs_no_vault_password_to_upload(client, host):
    _premium(client, host)
    assert raw_upload(client, host, "Rahul,9876543210\n").json()["added"] == 1


def test_admin_can_upload(client):
    token = client.post("/auth/login", json={"passcode": "test-admin-passcode"}).json()["token"]
    admin = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/me", headers=admin).json()["role"] == "admin"
    assert raw_upload(client, admin, "Admin Friend Xyz,9123456780\n", dry_run=True).status_code == 200


def test_downgraded_host_loses_upload_at_once(client, host):
    from models import Host
    from db import SessionLocal

    _premium(client, host)
    with SessionLocal() as db:
        db.get(Host, client.get("/auth/me", headers=host).json()["id"]).role = "host"
        db.commit()
    assert raw_upload(client, host, "Rahul,9876543210\n").status_code == 402


def test_create_host_needs_the_right_secret(client):
    token = client.post("/auth/login", json={"passcode": "test-admin-passcode"}).json()["token"]
    admin = {"Authorization": f"Bearer {token}"}
    new = {"username": "confirmcheck", "display_name": "Check", "password": "password123", "role": "premium", "passcode": None}
    assert client.post("/admin/hosts", headers=admin, json={**new, "confirm": "wrong"}).status_code == 400
    assert "confirmcheck" not in [h["username"] for h in client.get("/admin/hosts", headers=admin).json()]
    assert client.post("/admin/hosts", headers=admin, json={**new, "confirm": "test-admin-passcode"}).status_code == 200
    assert "confirmcheck" in [h["username"] for h in client.get("/admin/hosts", headers=admin).json()]


def test_dugout_refuses_clash_and_counts_people_once(client, host):
    vault = _premium(client, host)
    add(client, host, "Rahul", RAHUL)
    game = {"ground_name": "Ramp", "play_date": "2026-11-01", "start_time": "07:00", "duration_min": 60}
    clash = client.post("/teamsheet/games", headers=vault, json={**game, "players": [{"name": "Rahul", "phone": AMIT, "amount": 100}]})
    assert clash.status_code == 409
    twice = [{"name": "Rahul", "phone": RAHUL, "amount": 100}, {"name": "rahul", "amount": 100}, {"name": "Ganesh +1", "amount": 100}]
    res = client.post("/teamsheet/games", headers=vault, json={**game, "players": twice}).json()
    assert (res["players"], res["total_amount"]) == (2, 200)


def test_scorebook_refuses_duplicates_too(client, host):
    vault = _premium(client, host)
    add(client, host, "Rahul", RAHUL)
    assert client.post("/khata/players", headers=vault, json={"name": "rahul"}).status_code == 409
    amit = client.post("/khata/players", headers=vault, json={"name": "Amit"}).json()
    assert client.patch(f"/khata/players/{amit['id']}", headers=vault, json={"name": "RAHUL"}).status_code == 409
    assert client.post("/khata/players", headers=vault, json={"name": "   "}).status_code == 400


def test_set_phone_on_booking_row_still_unique(client, host, ground):
    add(client, host, "Rahul", RAHUL)
    amit = add(client, host, "Amit").json()
    assert client.put(f"/players/{amit['id']}/phone", headers=host, json={"phone": RAHUL}).status_code == 409


def test_old_roster_upload_still_works(client, host):
    res = client.post("/roster/upload", headers=host, files={"file": ("s.csv", f"Name,Phone\nRahul 2,{RAHUL}\nBad,123\n".encode())})
    assert res.json()["players"] == [{"name": "Rahul 2", "phone": RAHUL}, {"name": "Bad", "phone": None}]


# ---------- two requests at once ----------

def test_database_refuses_a_race(client, host):
    """Both requests pass the name check, so only the unique index can stop the second."""
    token = host
    results = []
    barrier = threading.Barrier(6)

    def go(i):
        barrier.wait()
        results.append(add(client, token, "Racer").status_code)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(200) == 1 and all(r in (200, 409) for r in results), results
    assert names(client, host).count("Racer") == 1


def test_race_loser_gets_409_not_500(client, host, monkeypatch):
    add(client, host, "Rahul")
    monkeypatch.setattr("routes_contacts.check_name_free", lambda *a, **k: None)
    res = add(client, host, "Rahul")
    assert res.status_code == 409 and "already saved" in res.json()["detail"]


# ---------- moving older data to unique names ----------

OLD_PLAYERS = """
CREATE TABLE players (id INTEGER PRIMARY KEY, host_id INTEGER, name VARCHAR(120), phone VARCHAR(15),
                      archived BOOLEAN DEFAULT 0, pay_slug VARCHAR(16), created_at DATETIME);
"""


def _migrate(path, monkeypatch, rows):
    con = sqlite3.connect(path)
    con.executescript(OLD_PLAYERS + "CREATE TABLE hosts (id INTEGER PRIMARY KEY, role VARCHAR(10));INSERT INTO hosts VALUES (1,'admin'),(2,'host');")
    con.executemany("INSERT INTO players (id, host_id, name, phone) VALUES (?,?,?,?)", rows)
    con.commit()
    con.close()
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE players ADD COLUMN name_key VARCHAR(400)"))
        db_module._unique_player_names(conn)
        conn.execute(text("CREATE UNIQUE INDEX ux_players_host_name ON players (host_id, name_key)"))
        first = conn.execute(text("SELECT id, name, name_key, phone FROM players ORDER BY id")).all()
        db_module._unique_player_names(conn)  # second start: nothing to do
        again = conn.execute(text("SELECT id, name, name_key, phone FROM players ORDER BY id")).all()
    engine.dispose()
    assert first == again
    return first


def test_migration_renames_twins_and_keeps_every_row(tmp_path, monkeypatch):
    rows = _migrate(tmp_path / "old.db", monkeypatch, [
        (1, 1, "Rahul", RAHUL), (2, 1, "rahul", AMIT), (3, 1, "RAHUL ", None), (4, 1, "Rahul 2", SID),
        (5, 2, "Rahul", "9111111111"), (6, None, "Rahul", None),
    ])
    assert [r.name for r in rows] == ["Rahul", "rahul 3", "RAHUL 4", "Rahul 2", "Rahul", "Rahul 5"]
    assert [r.phone for r in rows] == [RAHUL, AMIT, None, SID, "9111111111", None]  # nobody's number moved


def test_migration_on_a_clean_table(tmp_path, monkeypatch):
    rows = _migrate(tmp_path / "old2.db", monkeypatch, [(1, 1, "Rahul", None), (2, 1, "Amit", None)])
    assert [r.name for r in rows] == ["Rahul", "Amit"]
