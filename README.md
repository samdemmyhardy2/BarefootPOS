# Table & Thyme · Restaurant operations

A responsive React dashboard for the NestJS restaurant backend. The app uses React Router for separate role-aware routes, Zustand for authentication, live orders, and UI state, and Tailwind CSS for the interface.

## Run locally

```bash
npm install
npm run dev
```

The Vite development server proxies `/api/*` to `http://localhost:3000`. Start the backend first, apply its Prisma migrations, and make sure PostgreSQL is reachable. To point the UI at another API host, create `.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

## Routes

- `/login` — employee and administrator sign-in
- `/overview` — live service snapshot
- `/orders` — build and send a table order
- `/tracker` — live order status board
- `/kitchen` — accept and prepare tickets
- `/ready` — waiter pickup and served acknowledgement
- `/tables` — table availability and status
- `/attendance` — employee check-in/out and shift history
- `/menu`, `/team` — administrator menu and employee management

## Live order updates

The signed-in client requests a short-lived scoped stream token from `GET /orders/events/token`, then opens `GET /orders/events?streamToken=...` with `EventSource`. The stream sends an initial `snapshot`, followed by `created`, `updated`, and `deleted` events. The client renews its stream token when reconnecting. The API's `/orders/events` feed is process-local; multi-instance deployments need a shared event broker.

The API persists an eight-hour JWT in browser local storage for this internal dashboard. Use HTTPS in deployed environments and configure `VITE_API_URL` to the public API origin.
