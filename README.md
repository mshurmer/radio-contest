# 📻 Radio Contest Logger

A lightweight, real-time logging app for amateur radio contests. Designed for use on a local network with up to 5 operators. No authentication or internet connection required.

The software is only required to run the server

Clients use a normal web browser
---


1. Make sure you have [Node.js](https://nodejs.org) installed (which may include `npm`)
Make sure to install the server-side packages (Express, SQLite, Socket.IO):  see npm install

sudo apt update
sudo apt install git
sudo apt install nodejs
node -v
npm -v

may need 
sudo apt install npm

git clone https://github.com/mshurmer/radio-contest.git

npm install

## 🚀 Features

- Log contacts by callsign, band, mode, and signal reports
- Auto-calculates contest points based on mode, band, and time
- Live updates across all connected operators using Socket.IO
- Filter logs by callsign, band, and mode
- Edit and delete logged entries
- Flag non-contest stations and add operator comments
- Admin panel to configure "Years Licensed"
- Built-in time and band/mode duplicate checking

---

## 📦 Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js + Express
- **Database:** SQLite
- **Real-Time:** Socket.IO

---





## 🛠️ Setup Instructions

1. **Clone the repo:**

git clone https://github.com/mshurmer/radio-contest.git

cd radio-contest

2. Install dependencies: This installs all required backend packages listed in package.json.

npm install

3. Configure local settings:

Copy `.env.example` to `.env` and set strong passwords and a long random dump token. Set `REQUIRE_LOGIN=true` if the web interface should require a login.

4. Start the server:
node server/server.js

5. Open your browser:
http://localhost:3000

📁 Folder Structure
/server         -> Node.js + SQLite backend
/public         -> HTML/CSS/JS frontend
/database       -> contest.db and schema
