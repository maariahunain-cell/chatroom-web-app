# ChatRoom

A small, responsive, one-room group chat built with React, Vite, and Firebase.

## Features

- Join with a display name — no email or password form.
- One shared `#general` room.
- Live messages across devices when Firebase is configured.
- Message timestamps and a latest-100 message window.
- Quick emoji picker and Shift+Enter for a new line.
- Responsive layout for desktop, tablet, and mobile.
- Local demo mode when Firebase credentials are not configured.

## 1. Run the local demo

You need Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

Without Firebase settings, ChatRoom runs in **Local demo** mode. Messages are saved in this browser only (and shared between tabs in the same browser). They do not sync to another device.

## 2. Enable live chat across devices with Firebase

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. In **Authentication → Sign-in method**, enable **Anonymous** sign-in.
3. Create a **Cloud Firestore** database.
4. Open **Firestore Database → Rules**, paste the contents of `firestore.rules`, and publish the rules.
5. In **Project settings → General**, register a Web app and copy its Firebase configuration values.
6. Copy `.env.example` to a new file named `.env` in the project root.
7. Fill in the six `VITE_FIREBASE_...` values in `.env` using the Firebase web app configuration.
8. Stop and restart the dev server:

```bash
npm run dev
```

The status indicator should change to **Live connection** after you join. Open the app on another device/browser and join the same room to test cross-device messaging.

### Important Firebase notes

- The Firebase web config identifies your project; it is not a server-side secret. Keep service-account keys and private credentials out of this frontend project.
- The included Firestore rules require anonymous authentication, restrict writes to the `general` room, validate message fields and lengths, and prevent editing/deleting messages.
- These rules do not provide robust spam prevention or moderation. Before making a public community, add Firebase App Check, abuse controls, reporting/moderation, and an appropriate privacy policy.
- This is a shared room. Do not post passwords, phone numbers, addresses, or other private information.

## 3. Production build

```bash
npm run build
npm run preview
```

Vite creates the production site in `dist/`.

## 4. Upload to GitHub

1. Create a new empty repository on GitHub.
2. In this project folder, run:

```bash
git init
git add .
git commit -m "Build ChatRoom app"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

`.gitignore` excludes `.env`, `node_modules`, and `dist`. Do not commit your local `.env` file.

For a hosted live version, deploy the project to a static hosting service such as Vercel or Netlify and add the same six `VITE_FIREBASE_...` environment variables in that service's project settings. Firebase Authentication's authorized domains must include the deployed domain.

## Project structure

```text
chatroom-project/
├── src/
│   ├── App.jsx
│   ├── firebase.js
│   ├── main.jsx
│   └── styles.css
├── .env.example
├── .gitignore
├── firestore.rules
├── index.html
├── package.json
├── README.md
└── vite.config.js
```
