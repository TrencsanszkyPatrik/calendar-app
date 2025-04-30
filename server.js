const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Supabase kliens inicializálása
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase kapcsolat és táblák ellenőrzése
supabase.from('users').select('count').then(({ data, error }) => {
    if (error) {
        console.error('Hiba az adatbázis kapcsolódás során:', error);
        console.log('Supabase URL:', supabaseUrl);
        console.log('Supabase Key:', supabaseKey ? 'Beállítva' : 'Nincs beállítva');
    } else {
        console.log('Sikeresen csatlakoztunk az adatbázishoz!');
        console.log('Felhasználók száma:', data[0].count);
        
        // Táblák ellenőrzése
        supabase.from('events').select('count').then(({ data: eventsData, error: eventsError }) => {
            if (eventsError) {
                console.error('Hiba az events tábla ellenőrzése során:', eventsError);
            } else {
                console.log('Events tábla létezik, rekordok száma:', eventsData[0].count);
            }
        });
    }
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'titkos_kulcs_ide',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 1 hét
    }
}));

// Bejelentkezés
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        console.log('Bejelentkezési kísérlet:', username);
        
        // Először ellenőrizzük, hogy van-e felhasználó az adatbázisban
        const { data: users, error: countError } = await supabase
            .from('users')
            .select('*');
            
        if (countError) {
            console.error('Felhasználók lekérdezése sikertelen:', countError);
            return res.status(500).json({ error: 'Adatbázis hiba történt' });
        }
        
        console.log('Felhasználók az adatbázisban:', users);
        
        // Felhasználó keresése
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error) {
            console.error('Supabase hiba:', error);
            return res.status(500).json({ error: 'Adatbázis hiba történt' });
        }
        
        if (!user) {
            console.log('Felhasználó nem található:', username);
            return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
        }

        // Jelszó ellenőrzése
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Hibás jelszó a felhasználónak:', username);
            return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
        }

        // Session beállítása
        req.session.userId = user.id;
        console.log('Sikeres bejelentkezés:', username);
        
        res.json({ 
            id: user.id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Bejelentkezési hiba részletei:', error);
        res.status(500).json({ error: 'Hiba történt a bejelentkezés során: ' + error.message });
    }
});

// Események lekérése
app.get('/api/events', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }

    try {
        const { data: events, error } = await supabase
            .from('events')
            .select(`
                *,
                creator:creator_id(username),
                shared_users:event_shares(user:users(username))
            `)
            .or(`creator_id.eq.${req.session.userId},is_shared.eq.true,event_shares.user_id.eq.${req.session.userId}`);

        if (error) throw error;

        // Átalakítjuk a választ a régi formátumra
        const formattedEvents = events.map(event => ({
            ...event,
            creator_name: event.creator?.username,
            shared_with: event.shared_users?.map(share => share.user.username).join(', ')
        }));

        res.json(formattedEvents);
    } catch (error) {
        console.error('Hiba:', error);
        res.status(500).json({ error: 'Hiba történt az események lekérése során' });
    }
});

// Új esemény létrehozása
app.post('/api/events', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }

    const { title, description, date, startTime, endTime, eventType, is_shared, shared_with } = req.body;

    if (!title || !date || !startTime || !endTime || !eventType) {
        return res.status(400).json({ error: 'Hiányzó kötelező mezők' });
    }

    try {
        // Esemény létrehozása
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert([{
                title,
                description,
                date,
                startTime,
                endTime,
                eventType,
                creator_id: req.session.userId,
                is_shared: is_shared ? true : false
            }])
            .select()
            .single();

        if (eventError) throw eventError;

        // Megosztások létrehozása
        if (is_shared && shared_with && shared_with.length > 0) {
            const shares = shared_with.map(userId => ({
                event_id: event.id,
                user_id: userId
            }));

            const { error: shareError } = await supabase
                .from('event_shares')
                .insert(shares);

            if (shareError) throw shareError;
        }

        res.json({ id: event.id });
    } catch (error) {
        console.error('Hiba:', error);
        res.status(500).json({ error: 'Hiba történt az esemény létrehozása során' });
    }
});

// Esemény törlése
app.delete('/api/events/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }

    try {
        // Először ellenőrizzük, hogy a felhasználó tulajdonosa-e az eseménynek
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select()
            .eq('id', req.params.id)
            .eq('creator_id', req.session.userId)
            .single();

        if (eventError || !event) {
            return res.status(403).json({ error: 'Nincs jogosultság a törléshez' });
        }

        // Megosztások törlése
        await supabase
            .from('event_shares')
            .delete()
            .eq('event_id', req.params.id);

        // Esemény törlése
        const { error: deleteError } = await supabase
            .from('events')
            .delete()
            .eq('id', req.params.id);

        if (deleteError) throw deleteError;

        res.json({ message: 'Esemény törölve' });
    } catch (error) {
        console.error('Hiba:', error);
        res.status(500).json({ error: 'Hiba történt az esemény törlése során' });
    }
});

// Felhasználói adatok lekérése
app.get('/api/user', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Bejelentkezés szükséges' });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, username, email')
            .eq('id', req.session.userId)
            .single();

        if (error) throw error;
        if (!user) {
            return res.status(404).json({ error: 'Felhasználó nem található' });
        }

        res.json(user);
    } catch (error) {
        console.error('Hiba:', error);
        res.status(500).json({ error: 'Hiba történt a felhasználói adatok lekérése során' });
    }
});

// Kijelentkezés
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Hiba a kijelentkezés során:', err);
            return res.status(500).json({ error: 'Hiba történt a kijelentkezés során' });
        }
        res.json({ message: 'Sikeres kijelentkezés' });
    });
});

// Felhasználó regisztráció
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Hiányzó kötelező mezők' });
    }

    try {
        // Jelszó titkosítása
        const hashedPassword = await bcrypt.hash(password, 10);

        // Felhasználó létrehozása
        const { data: user, error } = await supabase
            .from('users')
            .insert([{
                username,
                email,
                password: hashedPassword
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            id: user.id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Hiba:', error);
        if (error.code === '23505') { // Egyedi mező megsértése
            return res.status(400).json({ error: 'A felhasználónév vagy email már foglalt' });
        }
        res.status(500).json({ error: 'Hiba történt a regisztráció során' });
    }
});

// Szerver indítása
app.listen(port, () => {
    console.log(`A szerver fut a következő porton: ${port}`);
}); 