# How to add your own data

This is the whole system in plain steps. No SQL, no code, no spreadsheets — you
type into the same forms a user would.

Live site: **https://frontend-seven-sandy-85.vercel.app**
Sign in: `admin@mams.mil` / `Password123`

---

## Before you start: the one idea that makes it simple

Every number on the dashboard is a running total, and it works in this order:

```
   What you already had  (Opening Stock)
+  What you bought       (Purchases)
+  What arrived from another base (Transfers in)
-  What left for another base (Transfers out)
-  What you handed to personnel (Assignments)
-  What was destroyed or lost (Write-offs)
=  What you have now     (Closing Balance)
```

So you only need to answer one question at a time: *what happened?* You never
have to work out a total by hand — type one thing at a time and watch the
dashboard add it up.

---

## Step 1 — Opening Stock (do this first)

This is the stock each base **already holds** before you start using the system.

**Menu → Opening Stock → “+ Add opening stock”**

Fill in just four things:

| Field | What to type |
|---|---|
| Base | Which base holds this stock |
| Equipment type | What kind of item it is |
| Quantity held | How many |
| As of date | The date you counted it |

That's it. The Dashboard's **Opening Balance** figure now shows your total.

> Entering the same item and date again **adds** to it, so you can build up a
> figure in several small steps instead of adding it up in your head.

---

## Step 2 — Purchases

Anything you **buy** or receive from a supplier.

**Menu → Purchases → “+ Record purchase”**

| Field | What to type |
|---|---|
| Base | Which base received it |
| Equipment type | What was bought |
| Quantity | How many |
| Unit cost | Price for **one** item |
| Purchase date | When you took delivery |
| Supplier / Invoice no. | Optional, but useful for your records |

Leave the cost fields blank if you do not track money — the totals simply show
zero and everything else still works.

---

## Step 3 — Transfers between bases

Moving stock from one base to another.

**Menu → Transfers → “+ New transfer”**

1. Choose the **From** base and the **To** base — they must be different.
2. Choose the equipment and quantity, then **Dispatch**.

That immediately reduces the sending base. When the load physically arrives,
open the transfer and click **Receive** — that adds it to the receiving base.

For the same reason, if the load never leaves, click **Cancel** and the stock
goes back to the sending base.

---

## Step 4 — Assignments (handing assets to people)

**Menu → Assignments & Expenditures → “+ New assignment”**

| Field | What to type |
|---|---|
| Base | Which base issued the stock |
| Equipment type + Quantity | What was issued |
| Personnel name | **Required** — who received it |
| Personnel ID / Rank / Due date | Optional |

The stock leaves the base straight away, which is correct: the base no longer
holds it.

---

## Step 5 — Expenditures (used up, spoiled or lost)

Same page, the **Expenditures** tab → “+ Record expenditure”.

- **Against an assignment** — the ammunition was fired in the field. Pick the
  assignment, enter how much was used. This does **not** reduce base stock
  again, because it already left when it was assigned.
- **Direct write-off** — spoilage or loss with no assignment. Enter a reason
  and remarks. This **does** reduce base stock.

---

## Step 6 — Check your numbers

**Menu → Dashboard** now shows Opening Balance, Net Movement, Assigned,
Expended and Closing Balance, with breakdowns per base and per item.

To see the individual transactions behind any number, click the **Net
Movement** card — it opens a pop-up listing the exact purchases, transfers in
and transfers out that make it up.

---

## Roles — who can do what

| Role | Can add |
|---|---|
| **Admin** (`admin@mams.mil`) | Everything, on all 4 bases, plus user management |
| **Base Commander** | Everything, on their own base only |
| **Logistics Officer** | Purchases and transfers only, on their own base |

The menu hides buttons a role cannot use, and the server refuses the request
even if someone tries anyway.

---

## Rules that protect your records

- Quantities must be a whole number **greater than zero**.
- You cannot transfer more than a base actually has.
- You cannot issue more than a base actually has.
- Purchases and transfers are never deleted — mistakes are corrected by adding
  a reversing entry, so the history stays trustworthy. That is why there is no
  "Delete" button.

---

## Common questions

**A figure looks wrong.**
Check the date filter at the top of each page — it defaults to showing
everything, but a narrow range hides earlier records. Click **Reset** to clear it.

**Can I undo a mistake?**
There is no delete, by design. For an opening balance, enter the same item and
date again to add to it. For a purchase or transfer, record a correcting entry
(transfer it back, or log an expenditure) so both entries stay in the history.

**I only want to use one base.**
Sign in as that base's commander. Their view is already limited to that base.

**I need the raw data.**
Menu → **API Audit Log** shows every action with who did it and when. It also
keeps a record of any attempt that was refused.
