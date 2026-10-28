import math


def split_amount(total: int, fixed: list[int | None], round_to: int = 1) -> list[int]:
    """Split `total` across players.

    `fixed[i]` is a custom amount for player i (or None to share the remainder).
    With round_to > 1 every flexible share is rounded *up* to that step, so the
    organiser never ends up short; otherwise the leftover rupees go to the first few.
    """
    flexible = [i for i, f in enumerate(fixed) if f is None]
    remaining = max(total - sum(f for f in fixed if f is not None), 0)
    result = [f or 0 for f in fixed]
    if not flexible:
        return result

    n = len(flexible)
    if round_to > 1:
        share = math.ceil(remaining / n / round_to) * round_to
        for i in flexible:
            result[i] = share
    else:
        base, extra = divmod(remaining, n)
        for rank, i in enumerate(flexible):
            result[i] = base + (1 if rank < extra else 0)
    return result
