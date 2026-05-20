# Sprint 4 Retrospective  
Campus Marketplace | 18 May 2026  

## Sprint Overview  
Sprint 4 marked the final sprint of the Campus Marketplace project and focused on stabilising, refining, integrating, and preparing the system for final presentation and submission. The sprint included reliability improvements, payment flow fixes, reporting and moderation systems, admin tooling, notification handling, export functionality, dashboard polishing, and final UI/UX refinements across the platform.

Unlike previous sprints that focused heavily on feature expansion, Sprint 4 became a reliability and integration sprint. The team spent significant time resolving inconsistencies between frontend flows, Firestore data structures, payment handling, notifications, deployment environments, and admin workflows. Final testing, debugging, and presentation preparation became just as important as feature implementation itself.

Despite technical setbacks during the final presentation and the pressure of academic deadlines, the team successfully delivered a functional end-to-end application with core marketplace functionality fully operational.

---

# What Went Well  

### The team delivered a complete working platform  
By the end of the sprint, the Campus Marketplace system included listing creation, browsing, ratings, reporting, messaging, payments, trade functionality, moderation systems, staff workflows, dashboards, exports, notifications, and admin tooling.

### Reliability and integration issues were actively resolved  
A major success of Sprint 4 was the team's focus on fixing silent failures, inconsistent data handling, payment logic problems, and UI reliability issues.

### Strong ownership of complex systems  
Team members took ownership of major feature areas including reporting systems, payment workflows, notifications, admin tooling, exports, dashboards, and deployment preparation.

### Improved collaboration compared to previous sprints  
Multiple members independently noted that teamwork and collaboration improved during Sprint 4.

### Valuable real-world software engineering experience  
The sprint exposed the team to practical software engineering challenges such as merge conflicts, deployment issues, API integration, Firestore security rules, testing, and debugging under pressure.

---

# What Could Be Improved  

### Integration testing needed to happen earlier  
Several systems worked independently but failed during full integration or demonstration scenarios. More continuous end-to-end testing would have improved stability.

### Better coordination before implementation  
Some technical problems resulted from inconsistent Firestore fields, duplicate logic, and developers implementing features independently without aligning on shared structures.

### Time pressure affected stability  
Important debugging and testing occurred very close to the presentation deadline, leaving little room for unexpected failures.

### Communication still required improvement  
Communication gaps still contributed to technical problems such as merge conflicts, inconsistent field naming, and assumptions about backend readiness.

### More structured infrastructure planning was needed  
Environment variables, deployment configuration, quotas, CI pipelines, and security rules needed earlier planning and coordination.

---

# Team Feedback Summary  

| Member | Sentiment | Key Point |
|---|---|---|
| Mmaphefo | Reflective and realistic | Final sprint highlighted how difficult software integration and presentation stability can be |
| Siphokazi | Positive and collaborative | Focused on payment flows, UI cleanup, and notification consistency |
| Kgethego | Reliability-focused | Fixed silent failures, payment logic inconsistencies, overdue alerts, and dashboard reliability |
| Nontokozo | Strong ownership | Built reporting and moderation systems while improving admin tooling and security rules |
| Tebogo | Problem-solving under pressure | Managed exports, deployment fixes, and fallback Stripe demo flows |
| Victor | Proud but honest | Learned major lessons about communication, APIs, and schema planning |

---

# Major Themes From Sprint 4  

### Reliability became more important than adding features  
By Sprint 4, ensuring existing systems worked consistently became more important than introducing entirely new features.

### Software integration is harder than isolated development  
Many features worked independently but became more difficult once integrated into the full application.

### Communication directly impacts technical quality  
The sprint reinforced that communication problems often become technical problems later.

### Real-world software development requires adaptability  
The team had to adapt continuously to integration failures, deployment problems, payment issues, and presentation constraints.

---

# Action Items / Final Reflections  

- Establish shared schemas and naming conventions earlier.
- Prioritise continuous integration testing throughout development.
- Break large components into smaller subcomponents earlier.
- Plan deployment and infrastructure concerns from the start.
- Maintain the improved support culture shown during Sprint 4.

---

# Closing Reflection  

Sprint 4 was challenging, stressful, and technically demanding, but it represented substantial growth for the team as developers. The project exposed the realities of collaborative software engineering including integration issues, deployment failures, API complications, debugging under pressure, and balancing technical quality with deadlines.

Despite setbacks, the team successfully delivered a complete Campus Marketplace platform with meaningful functionality across buyers, sellers, staff, and administrators. The sprint provided valuable practical experience that extends far beyond the classroom.