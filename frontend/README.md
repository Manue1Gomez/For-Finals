# BRB Studios Frontend

The frontend is a Vite + React app. Install its dependencies from `frontend` with `npm install`. Install backend dependencies separately from `backend` with `npm install`.

For development, start the backend in one terminal (`node app.js` or `npm run dev` from `backend`), then start Vite in a second terminal with `npm run dev` from `frontend`. Open the `Local` URL Vite prints; it redirects to the customer home page. Vite proxies `/api` and `/uploads` requests to the backend.

Create a production build with `npm run build` from `frontend`; run `npm start` from `backend` to serve that build through Express. Run backend tests with `npm test` from `backend`. All customer and admin pages are mounted in React, including the New Walk-in Booking page.

The backend reads environment settings from `backend/.env` and stores uploads in `backend/uploads`.

`src/` contains the React application and its JavaScript modules. `public/` contains static images and stylesheets that are referenced by URL; those files are served unchanged by Vite. Legacy standalone customer scripts are no longer used.
