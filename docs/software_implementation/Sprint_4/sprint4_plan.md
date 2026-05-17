# Sprint Plan — Sprint 4

## Sprint Goal
Fix critical problems identified by the Product Owner (PO) in the final recorded sprint to stabilize the marketplace platform, improve user experience, and resolve payment, inspection, and overdue collection issues.

## Main Objective
The main objective of Sprint 4 is to **address and resolve all outstanding problems raised by the Product Owner**, as this is the last recorded sprint. No new feature development is prioritized beyond what is necessary to fix existing issues and complete the platform for final handoff.

---

## Problems Addressed (PO Feedback)

### Reports & Moderation
- When admin reviews reports, listings must be clickable for easy navigation
- Staff page needs to be functional and accessible

### Listings & Navigation
- Remove "Sell Item" from navigation bar and replace with floating action button (+)
- Remove "At Facility", "Declined", "Completed" statuses where no longer relevant
- Change cart icon/label to "Favourites" or equivalent
- Remove anything involving "collection" (legacy terminology)

### Payment & Transaction Flow
- Promote listings for payments (visibility for paid promotion)
- For full cash payments: fix notification logic so buyer is notified after inspection to come collect
- Use more automation for payment process
- Fix overall app flow

### Drop-off & Overdue Collection
- Overdue collection: apply penalties depending on context
- Compensation for overdue collection (e.g., partial refund to buyer or fee to seller)

### Inspection Failures
- If item does not pass inspection: either reschedule drop-off OR reverse payment (admin/system decision based on context)

### User Experience
- Cancel initiation from buyer side (US26)
- Loader / loading states improvement

### Other (Compulsory)
- Address all compulsory items flagged by PO

---

## Sprint Backlog

| User Story | Description | Priority |
|------------|-------------|----------|
| US26 | Cancel initiation of purchase (buyer side) | High |
| US27 | Restrict drop-off dates to ≤7 days after payment | High |
| US28 | Allow students to trade instead of direct payments | Medium |
| US29 | Notify seller about overdue drop-off + auto-cancel after grace period | High |
| US30 | Fix notification logic for cash payments after inspection | High |
| US31 | Remove "Sell Item" from nav bar; add floating action button (+) | Medium |
| US32 | Make listings clickable in admin report review screen | Medium |
| US33 | Overdue collection penalties & compensation logic | High |
| US34 | Remove legacy statuses (At Facility, Declined, Completed) | Low |
| US35 | Change cart icon to "Favourites" | Low |
| US36 | Remove all "collection" terminology from app | Low |
| US37 | Promote listings for payments (paid promotion feature) | Medium |
| US38 | Add loader/loading states throughout app | Low |
| US29 | Fix overall app flow (end-to-end transaction path) | High |
| US40 | Staff page implementation/cleanup | Medium |
| US41 | Automate payment process where possible | High |

---

## Definition of Done
- All acceptance criteria met for each user story
- Acceptance tests passed
- PO approval received for problem fixes
- No regression in existing core flows
- Notifications working correctly for all transaction states
- Payment automation verified (cash and digital)

---

## Sprint Duration
Standard sprint length (e.g., 2 weeks) — final sprint before project close.

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Too many high-priority items for one sprint | Focus on payment, inspection, and overdue collection first. Defer low-priority UI changes (icon, terminology) if needed |
| Last sprint — no time for rollback | Freeze non-critical changes early; test aggressively |
| Overdue penalty logic complexity | Start with simple penalty rule (e.g., % of item price), iterate based on PO feedback |

---

## Notes
This is the **final recorded sprint**. All remaining work after Sprint 4 will not be tracked as part of the sprint plan. The PO has emphasized fixing existing problems over introducing new features.