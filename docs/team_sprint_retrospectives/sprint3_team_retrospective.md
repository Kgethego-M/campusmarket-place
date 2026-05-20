# Sprint 3 Retrospective
**Campus Marketplace | 12 May 2026**

---

## Sprint Overview

Sprint 3 focused on staff dashboards and transaction workflows (US11), popular categories reporting (US19), ad integration (US20, US12), export functionality (US22), online payments (US13, US14), responsive layout fixes, and the trade facility. The sprint also carried the action items from Sprint 2 around communication and shared responsibility.

This sprint had a rocky middle—several team members went silent for days, progress stalled, and the payment integration remained a persistent blocker. However, the team rallied in the final days, successfully unblocking payments by switching providers and delivering the sprint scope.

---

## What Went Well

### The final push delivered results
After a slow period mid-sprint, the team came together. Athalia made a decisive call to switch from PayFast to Stripe and got payments working end-to-end. Victor completed responsive layout fixes across eight pages and fixed the My Offers refresh bug. Mmaphefo pushed through the staff confirmation flows and collection booking. The team closed strong.

### Team members stepped up beyond their assigned stories
Athalia took over US13 and US14 when the original assignee struggled, completely re-implementing the payment gateway. Kgethego finished early and remained available to assist. Nontokozo and Tebogo completed their work and offered support where needed.

### Technical problems were resolved
The GitHub memory issue that prevented tests from running was identified and worked around. Responsive layout issues that would have hurt usability were systematically fixed. Merge conflicts were handled without major disruption.

### Documentation improved
Daily scrum minutes were consistently recorded, use case diagrams were created for Sprint 3 stories, and the team worked toward release documentation. The discipline around documentation was noticeably better than previous sprints.

### The team completed the sprint
Despite payment API delays, deployment challenges, and mid-sprint disengagement, the team delivered the planned functionality and is ready for the Sprint 3 release.

---

## What Could Be Improved

### Mid-sprint disengagement was a problem again
This pattern from Sprint 2 resurfaced. Several team members reported "no progress over the past few days" in the 5 May stand-up. Academic commitments are understandable, but the lack of communication about downtime meant others couldn't plan around it. The team needs to flag expected low-availability periods earlier.

### Payment integration became a time sink that could have been avoided
The team waited on PayFast and PayStack compliance approvals for weeks without a fallback plan. Athalia eventually solved it in one day by switching to Stripe. The lesson is clear: if an external dependency is blocked for more than a few days, escalate or pivot earlier.

### Testing was deprioritised to the point of breaking
Victor identified that GitHub memory overuse was preventing tests from running, and the workaround was to skip tests entirely. This is not sustainable. The team is carrying technical debt on test coverage, and re-introducing tests needs to be prioritised early in Sprint 4.

### "My part is done" mentality still lingers
While many team members stayed engaged, there were still instances of people finishing their tasks and going quiet while others struggled. One member explicitly noted this as a frustration. The sprint is not complete until the whole team is done.

### Communication dropped off mid-sprint
After a solid start, the 5 May update showed four team members with minimal or no progress over multiple days, and communication about that downtime was inconsistent. The Sprint 2 action items around response time norms were not fully maintained.

---

## Team Feedback Summary

| Member | Sentiment | Key Point |
|--------|-----------|-----------|
| Kgethego | Complete | All allocated work done, assisted where needed |
| Mmaphefo | Progress-focused | Staff flows and collection booking advanced; continued refinements needed |
| Tebogo | Mixed | Ads integration progressed; communication on downtime could have been better |
| Victor | Productive but blocked | Layout fixes and trade facility done; payment approval and tests remain blockers |
| Nontokozo | Solid delivery | Layout fixes and admin profile completed; ready to assist |
| Athalia | Strong finish | Took over payment integration, switched to Stripe, ran stand-ups, documented |

### Consolidated sentiment from individual retrospective

> "Some team members checked out once their own tasks were done, rather than helping where the team still needed it. Heading into Sprint 4, the aim is to build a stronger sense of shared responsibility, where everyone feels invested in the sprint as a whole, not just their individual tasks."

---

## Action Items for Sprint 4

| Action | Owner(s) | Success Criteria |
|--------|----------|------------------|
| **Re-introduce tests safely** | Victor, team | Tests run on every push to develop; no deployment without passing tests |
| **External dependency fallback plan** | All | If an API/key/approval is blocked for >3 days, team escalates or evaluates alternatives |
| **Low-availability advance notice** | All | Message the team if you will have limited availability for 2+ days |
| **Shared responsibility check-in** | All | Before marking yourself as "done", ask: who still needs help? |
| **Maintain response time norm** | All | Acknowledge messages within 4 hours during working hours (as agreed in Sprint 2) |

---

## Overall Sprint Outcome

Sprint 3 was a sprint of two halves: a slow, disconnected middle followed by a strong, collaborative finish. The team successfully delivered staff transaction flows, ad integration, export features, responsive layouts, and—critically—a working payment integration via Stripe.

The unresolved pattern from Sprint 2 around mid-sprint disengagement and "my part is done" thinking continued to cause friction. However, the team's ability to rally and unblock itself in the final days shows what is possible when everyone stays engaged.

Sprint 4 needs to prioritise test recovery, earlier escalation on blockers, and a genuine shift toward collective ownership of the sprint outcome—not just individual tasks.