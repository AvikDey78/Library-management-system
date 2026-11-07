# CampusShelf — Library Management System

A web-based library management system built with plain **HTML, CSS and JavaScript**. It has separate Librarian and Student sides, automatic late fines, a reservation waitlist and printable issue slips. No server or database is needed; data is saved in the browser using `localStorage`.

**Live demo:** `https://<your-username>.github.io/Library-Management-System/`

## Features

### Librarian
- **Dashboard** with live stats (titles, copies, available, issued, overdue, pending fines), copies by department, most borrowed books and recent activity
- **Book management**: add, edit, delete, search and filter by department and semester
- **Issue / Return** books with a 14-day loan period
- **Waitlist** view to monitor and manage reservations
- **Fines** page with a "Mark paid" option
- **Members** list showing books held and fines due
- Export all issue records to **CSV**

### Student
- Register and log in with a personal account
- **Browse** books as cover cards, filtered by department and semester
- **Borrow** a book, or **join the waitlist** when all copies are out
- **My books** with due dates, days left, and reading history
- **My fines** showing late charges
- **Printable issue slip** with a QR-style code

### Smart rules
- **Late fine:** ₹2 per day after the due date, calculated on return
- **Waitlist hold:** when a book is returned, the copy is held for the first student in the queue and no one else can borrow it
- **Borrow limit:** a student can hold at most 3 books at a time
- Duplicate-borrow and no-stock checks, plus protection against deleting books that are still issued
- Dark and light theme toggle, fully responsive layout

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Librarian | `librarian` | `lib123` |
| Student | `student` | `stud123` |

New students can also register from the login screen. The **Reset demo data** button (librarian sidebar) restores the sample data.

## Project structure

```
Library-Management-System/
├── index.html   # page shell
├── style.css    # all styling (light/dark themes, responsive, print)
└── script.js    # data, rules, pages and events
```

## How to run

**Locally:** download the three files into one folder and open `index.html` in any browser.

**On GitHub Pages:**
1. Upload the files to the root of a public repository
2. Go to **Settings → Pages**
3. Choose **Deploy from a branch → main → / (root)** and save
4. Open the link shown after 1–2 minutes

## How it works

| Area | Logic |
|---|---|
| Storage | One JSON object (`books`, `members`, `issues`, `waitlist`) saved in `localStorage` |
| Availability | `copies − active issues − copies held for waitlisted students` |
| Fine | `max(0, return date − due date) × ₹2` |
| Waitlist | Queue ordered by join date; on return, the first waiting student's entry becomes "ready" and holds a copy |
| Slip | Print view shows only the slip; the code is generated from the issue details |

## Notes and limitations
- Data lives in each visitor's browser only, so it is not shared between devices.
- Passwords are stored in plain text in `localStorage`. This is acceptable for a college demo but not for real use. A production system would need a backend with hashed passwords.
- The slip code is a visual QR-style pattern, not a scannable QR code.

## Possible future improvements
- Backend and database (Node.js or Firebase) for shared data
- Password hashing and real authentication
- Email or SMS reminders for due dates
- Scannable QR/barcode issue slips

## Tech stack
HTML5 · CSS3 (variables, grid, flexbox) · Vanilla JavaScript (ES6) · localStorage

## Author
Avik Dey — CSE (AIML), IEM Kolkata
IT Workshop (PCCCS382) project
