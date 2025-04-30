const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://calendar-app-wbb8.onrender.com', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['set-cookie']
}));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        table: 'sessions',
        concurrentDB: true
    }),
    secret: process.env.SESSION_SECRET || 'titkos_kulcs_ide',
    resave: true,
    saveUninitialized: false,
    name: 'sessionId',
    proxy: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        httpOnly: true,
        path: '/',
        domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
    }
}));

// Session debug middleware
app.use((req, res, next) => {
    console.log('Request URL:', req.url);
    console.log('Request Origin:', req.headers.origin);
    console.log('Session ID:', req.sessionID);
    console.log('Session:', req.session);
    console.log('Cookies:', req.headers.cookie);
    next();
});

// Adatbázis inicializálása
const db = new sqlite3.Database(path.join(__dirname, 'calendar.db'), (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Csatlakozva az adatbázishoz.');
});

// Táblák létrehozása és felhasználók feltöltése
db.serialize(() => {
    // Felhasználók tábla
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Események tábla
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        eventType TEXT NOT NULL,
        creator_id INTEGER NOT NULL,
        is_shared BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);

    // Esemény megosztások tábla
    db.run(`CREATE TABLE IF NOT EXISTS event_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(event_id) REFERENCES events(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Ellenőrizzük, hogy vannak-e már felhasználók
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) {
            console.error('Hiba a felhasználók számának lekérdezésekor:', err);
            return;
        }

        // Ha nincsenek felhasználók, akkor létrehozzuk az alap felhasználókat
        if (row.count === 0) {
            const users = [
                { username: 'Patrik', password: 'patrik123', email: 'patrik@example.com' },
                { username: 'Kata', password: 'kata123', email: 'kata@example.com' }
            ];

            users.forEach(user => {
                bcrypt.hash(user.password, 10, (err, hash) => {
                    if (err) {
                        console.error('Hiba a jelszó titkosítása során:', err);
                        return;
                    }
                    db.run(`INSERT INTO users (username, password, email) VALUES (?, ?, ?)`,
                        [user.username, hash, user.email],
                        (err) => {
                            if (err) {
                                console.error('Hiba a felhasználó létrehozása során:', err);
                            } else {
                                console.log(`Felhasználó létrehozva: ${user.username}`);
                            }
                        });
                });
            });
        }
    });
});

// Middleware a bejelentkezés ellenőrzésére
const requireLogin = (req, res, next) => {
    console.log('Session check:', req.session);
    if (!req.session.userId) {
        console.log('No user ID in session');
        res.status(401).json({ error: 'Bejelentkezés szükséges' });
        return;
    }
    next();
};

// Bejelentkezés
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username);
    console.log('Request headers:', req.headers);
    
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Hiba történt a bejelentkezés során' });
        }
        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
        }
        
        try {
            const validPassword = await bcrypt.compare(password, user.password);
            if (validPassword) {
                console.log('Login successful:', username);
                req.session.regenerate((err) => {
                    if (err) {
                        console.error('Session regenerate error:', err);
                        return res.status(500).json({ error: 'Hiba történt a munkamenet létrehozása során' });
                    }
                    
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    
                    req.session.save((err) => {
                        if (err) {
                            console.error('Session save error:', err);
                            return res.status(500).json({ error: 'Hiba történt a munkamenet mentése során' });
                        }
                        
                        console.log('Session saved successfully:', req.sessionID);
                        console.log('Response headers:', res.getHeaders());
                        
                        return res.json({
                            id: user.id,
                            username: user.username,
                            email: user.email
                        });
                    });
                });
            } else {
                console.log('Invalid password for:', username);
                return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
            }
        } catch (error) {
            console.error('Password compare error:', error);
            return res.status(500).json({ error: 'Hiba történt a jelszó ellenőrzése során' });
        }
    });
});

// Kijelentkezés
app.post('/api/logout', (req, res) => {
    const sessionId = req.sessionID;
    console.log('Logout attempt - Session ID:', sessionId);
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
            return res.status(500).json({ error: 'Hiba történt a kijelentkezés során' });
        }
        res.clearCookie('sessionId');
        console.log('Session destroyed successfully:', sessionId);
        return res.json({ message: 'Sikeres kijelentkezés' });
    });
});

// Események lekérése
app.get('/api/events', (req, res) => {
    console.log('Events request - Session:', req.session);
    console.log('Events request - Session ID:', req.sessionID);
    
    if (!req.session || !req.session.userId) {
        console.log('No session or user ID found');
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }

    const userId = req.session.userId;
    console.log('Fetching events for user:', userId);
    
    db.all(`
        SELECT e.*, u.username as creator_name,
        GROUP_CONCAT(DISTINCT us.username) as shared_with
        FROM events e
        LEFT JOIN users u ON e.creator_id = u.id
        LEFT JOIN event_shares es ON e.id = es.event_id
        LEFT JOIN users us ON es.user_id = us.id
        WHERE e.creator_id = ? OR e.is_shared = 1 OR es.user_id = ?
        GROUP BY e.id
    `, [userId, userId], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Events found:', rows.length);
        return res.json(rows);
    });
});

// Új esemény létrehozása
app.post('/api/events', requireLogin, (req, res) => {
    const { title, description, date, startTime, endTime, eventType, is_shared, shared_with } = req.body;
    const creator_id = req.session.userId;

    if (!title || !date || !startTime || !endTime || !eventType) {
        res.status(400).json({ error: 'Hiányzó kötelező mezők' });
        return;
    }

    db.run('INSERT INTO events (title, description, date, startTime, endTime, eventType, creator_id, is_shared) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [title, description, date, startTime, endTime, eventType, creator_id, is_shared ? 1 : 0],
        function(err) {
            if (err) {
                console.error('Hiba az esemény létrehozásakor:', err);
                res.status(500).json({ error: 'Hiba történt az esemény létrehozásakor' });
                return;
            }
            
            const eventId = this.lastID;
            
            // Ha van megosztás, akkor azt is mentsük
            if (is_shared && shared_with && shared_with.length > 0) {
                const shareValues = shared_with.map(userId => 
                    `(${eventId}, ${parseInt(userId)})`
                ).join(',');
                
                db.run(`INSERT INTO event_shares (event_id, user_id) VALUES ${shareValues}`,
                    function(err) {
                        if (err) {
                            console.error('Hiba a megosztás létrehozásakor:', err);
                            res.status(500).json({ error: 'Hiba történt a megosztás létrehozásakor' });
                            return;
                        }
                        res.json({ id: eventId });
                    });
            } else {
                res.json({ id: eventId });
            }
        });
});

// Esemény törlése
app.delete('/api/events/:id', requireLogin, (req, res) => {
    const userId = req.session.userId;
    db.run('DELETE FROM events WHERE id = ? AND creator_id = ?',
        [req.params.id, userId],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(403).json({ error: 'Nincs jogosultság a törléshez' });
                return;
            }
            // Megosztások törlése
            db.run('DELETE FROM event_shares WHERE event_id = ?', [req.params.id]);
            res.json({ message: 'Esemény törölve' });
        });
});

// Felhasználók lekérése (megosztáshoz)
app.get('/api/users', requireLogin, (req, res) => {
    const userId = req.session.userId;
    db.all('SELECT id, username, email FROM users WHERE id != ?',
        [userId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        });
});

// Felhasználói adatok lekérése
app.get('/api/user', (req, res) => {
    console.log('User request - Session:', req.session);
    console.log('User request - Session ID:', req.sessionID);
    
    if (!req.session || !req.session.userId) {
        console.log('No session or user ID found');
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }
    
    db.get('SELECT id, username, email FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            console.log('User not found:', req.session.userId);
            return res.status(404).json({ error: 'Felhasználó nem található' });
        }
        console.log('User found:', user);
        return res.json(user);
    });
});

// Szerver indítása
app.listen(port, () => {
    console.log(`A szerver fut a következő porton: ${port}`);
}); 