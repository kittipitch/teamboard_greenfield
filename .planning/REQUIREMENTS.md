# Requirements: TeamBoard

**Defined:** 2026-04-19
**Core Value:** A team can add and read retrospective cards across three categories in a browser with zero setup or login.

## v1 Requirements

### Board

- [ ] **BOARD-01**: User can view three columns — Went Well, To Improve, Action Item — on a single page
- [ ] **BOARD-02**: User can see the card count displayed in each column header
- [ ] **BOARD-03**: User sees helpful empty-state guidance text when a column has no cards

### Cards

- [ ] **CARD-01**: User can add a text card to any column
- [ ] **CARD-02**: User can edit the text of an existing card inline
- [ ] **CARD-03**: User can delete any card
- [ ] **CARD-04**: Cards persist between page loads (stored in JSON file on server)

## v2 Requirements

### Facilitator

- **FACL-01**: Facilitator can enable private mode — cards are hidden until revealed
- **FACL-02**: User can vote on cards via dot voting (3 votes per person per session)
- **FACL-03**: Facilitator can clear/reset the board to start a fresh session

### Polish

- **POLS-01**: User can export the board as CSV
- **POLS-02**: Write endpoints have rate limiting to prevent abuse

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / login | Open access by design — anyone with the URL participates |
| Multiple boards / per-sprint sessions | Single shared board only; simplicity is the product |
| Author attribution on cards | Cards are anonymous by design |
| Real-time updates / WebSocket | Manual refresh is sufficient; eliminates complexity |
| Rich text / markdown in cards | Text only; keeps data model trivial |
| User accounts | Contradicts open-access goal |
| Database | JSON file storage only — zero infrastructure requirement |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BOARD-01 | Phase 3 | Pending |
| BOARD-02 | Phase 3 | Pending |
| BOARD-03 | Phase 3 | Pending |
| CARD-01 | Phase 3 | Pending |
| CARD-02 | Phase 3 | Pending |
| CARD-03 | Phase 3 | Pending |
| CARD-04 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-19*
*Last updated: 2026-04-19 after roadmap creation — all 7 v1 requirements mapped*
