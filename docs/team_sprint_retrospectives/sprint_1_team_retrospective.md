# Campus Marketplace: Sprint 1 Retrospective

## Overall Sprint Performance
The first sprint was an excellent start for the team. We successfully delivered the majority of our committed user stories within the two-week timeframe, which is a great achievement for our first run together. Any remaining items were minor and have been carried forward with their full context to ensure nothing is lost.

Team cohesion was a major highlight, with all six members actively contributing across the frontend, backend, and infrastructure tracks. We found that cross-functional pairing was highly effective in unblocking individuals whenever issues arose. Despite the typical setup friction that comes with a first sprint, we maintained positive momentum and built a strong foundation for the work ahead.

## What Went Well
*   **Strong Delivery:** Our high story completion rate set a very positive tone for the project.
*   **Effective Alignment:** Daily standups proved essential; they kept everyone on the same page and allowed us to surface and resolve blockers quickly.
*   **Problem-Solving Resilience:** While the initial Firebase integration was difficult, the team showed great persistence in getting it resolved and moving fast thereafter.
*   **Git Discipline:** We consistently used feature branches. Although we hit some merge conflicts, it showed a mature approach to version control for a new team.
*   **Infrastructure Success:** Successfully configuring the Azure deployment by the end of the sprint has provided us with a functional CI/CD pipeline.
*   **Proactive Support:** Team members frequently stepped across their usual boundaries (frontend/backend) to help each other out.

## Challenges & Lessons Learned
*   **Git Merge Conflicts:** Overlapping changes on shared files slowed down our integration process. Moving forward, we will adopt clearer branch naming conventions, merge to the develop branch every 1–2 days to reduce divergence, and designate a 'merge captain' each sprint.
*   **Azure Deployment Issues:** The initial setup for environment variables and build pipelines required multiple iterations. We plan to document the working configuration in our internal wiki and assign a 'DevOps lead' each sprint to make this repeatable.
*   **Team Communication:** Some decisions were made in side conversations, leading to duplicated work. We've decided that all architectural or design decisions must be posted in the team channel, and we will reserve time at the end of standups for general announcements.
*   **Firebase Setup:** Configuration took longer than estimated and wasn't shared consistently. We will add a setup guide to our README and include a setup buffer for similar stories in the next sprint.
*   **Testing:** We realized testing was often treated as an afterthought, with stories marked 'done' before tests were written. We are updating our Definition of Done to explicitly require unit tests before a story can be closed.

## Looking Ahead to Sprint 2
Our focus will shift toward maintaining our momentum while tightening our processes. We will enforce test coverage from day one, maintain cleaner Git hygiene through daily merges, and leverage our now-stable Azure pipeline for zero manual deployments. By improving our asynchronous communication and following our new action items, we are well-positioned for another successful sprint.
