# BWTDallas App

Internal operations portal for Bright World Technologies.

## Current Step

Step 1b: Database connection layer and foundation check page.

The app now verifies:

- Node/Express is running
- MySQL is reachable
- The selected database is correct
- Required Phase 1 foundation tables exist
- Starter config data is present

## Project Layout

```text
/app
├── docker-compose.yml
├── Dockerfile
├── .env
├── package.json
├── server.js
├── sql/
├── mysql/
├── routes/
├── controllers/
├── models/
├── middleware/
├── views/
└── public/