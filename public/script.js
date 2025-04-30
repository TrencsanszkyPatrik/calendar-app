// API URL
const API_URL = window.location.origin + '/api';

// Globális változók
let currentUser = null;
let currentDate = new Date();
let currentMonth = currentDate.getMonth();
let currentYear = currentDate.getFullYear();
let selectedDate = null; // Hozzáadva a kiválasztott dátum tárolásához

// Magyar hónapnevek
const monthNames = [
    'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
    'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December'
];

// Magyar napnevek (hétfővel kezdve)
const dayNames = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

// Ünnepek és jeles napok
const holidays = {
    '01-01': 'Újév',
    '03-15': '1848-as forradalom',
    '05-01': 'A munka ünnepe',
    '08-20': 'Szent István napja',
    '10-23': '1956-os forradalom',
    '11-01': 'Mindenszentek',
    '12-25': 'Karácsony',
    '12-26': 'Karácsony másnapja'
};

// Események tárolása
let events = [];

// Aktuális hét kezdő és vég dátuma
let currentWeekStart = new Date();
currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1);

// Bejelentkezés kezelése
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        
        if (response.ok) {
            const user = await response.json();
            currentUser = {
                id: user.id,
                username: user.username,
                email: user.email
            };
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
            initCalendar();
        } else {
            const error = await response.json();
            alert(error.error || 'Hiba történt a bejelentkezés során');
        }
    } catch (error) {
        console.error('Hiba:', error);
        alert('Hiba történt a bejelentkezés során');
    }
}

// Kijelentkezés kezelése
async function handleLogout() {
    try {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = null;
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('authModal').style.display = 'block';
            document.getElementById('loginForm').reset();
        }
    } catch (error) {
        console.error('Hiba:', error);
    }
}

// Naptár inicializálása
function initCalendar() {
    updateCalendarHeader();
    generateCalendar();
    loadEvents();
}

// Naptár fejléc frissítése
function updateCalendarHeader() {
    document.getElementById('currentMonth').textContent = 
        `${monthNames[currentMonth]} ${currentYear}`;
}

// Dark mode kezelése
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    const isDark = body.getAttribute('data-theme') === 'dark';
    
    if (isDark) {
        body.removeAttribute('data-theme');
        themeToggle.innerHTML = '<i class="bi bi-moon-fill"></i>';
    } else {
        body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="bi bi-sun-fill"></i>';
    }
}

function getWeekStart(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + (day === 0 ? -6 : 1); // hétfővel kezdjük
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
}

// Naptár generálása
function generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    calendarGrid.innerHTML = '';

    // Képernyőméret ellenőrzése
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        currentWeekStart = getWeekStart(currentDate);
        generateWeekView(calendarGrid);
    } else {
        generateMonthView(calendarGrid);
    }

    // Események betöltése és megjelenítése
    loadEvents().then(() => {
        updateEventCounts();
    });
}

// Heti nézet generálása
function generateWeekView(calendarGrid) {
    // Töröljük a teljes tartalmat
    while (calendarGrid.firstChild) {
        calendarGrid.removeChild(calendarGrid.firstChild);
    }

    // Heti navigáció hozzáadása
    const weekNav = document.createElement('div');
    weekNav.className = 'week-navigation';
    weekNav.innerHTML = `
        <button class="nav-btn" id="prevWeek">←</button>
        <div class="week-title"></div>
        <button class="nav-btn" id="nextWeek">→</button>
    `;
    calendarGrid.appendChild(weekNav);

    // Hét címének beállítása
    updateWeekTitle();

    // Napok generálása
    for (let i = 0; i < 7; i++) {
        const currentDayDate = new Date(currentWeekStart);
        currentDayDate.setDate(currentWeekStart.getDate() + i);

        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        // Mai nap kiemelése
        if (isToday(currentDayDate)) {
            dayElement.classList.add('today');
        }

        // Nap információk
        const dayInfo = document.createElement('div');
        dayInfo.className = 'day-info';
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = currentDayDate.getDate();
        
        const dayName = document.createElement('div');
        dayName.className = 'day-name';
        const dayIndex = currentDayDate.getDay();
        dayName.textContent = dayNames[dayIndex === 0 ? 6 : dayIndex - 1];

        dayInfo.appendChild(dayNumber);
        dayInfo.appendChild(dayName);
        dayElement.appendChild(dayInfo);

        // Események konténer
        const dayEvents = document.createElement('div');
        dayEvents.className = 'day-events';
        dayElement.appendChild(dayEvents);

        // Események számának megjelenítése
        const dateStr = formatDate(currentDayDate);
        const dayEventCount = events.filter(event => event.date === dateStr).length;
        if (dayEventCount > 0) {
            const countElement = document.createElement('div');
            countElement.className = 'event-count';
            countElement.textContent = dayEventCount;
            dayElement.appendChild(countElement);
        }

        // Ünnepnap ellenőrzése
        const monthDay = `${String(currentDayDate.getMonth() + 1).padStart(2, '0')}-${String(currentDayDate.getDate()).padStart(2, '0')}`;
        if (holidays[monthDay]) {
            dayElement.classList.add('holiday');
            dayElement.title = holidays[monthDay];
        }

        dayElement.addEventListener('click', () => {
            const clickedDate = new Date(currentDayDate);
            showDayDetails(
                clickedDate.getDate(),
                clickedDate.getMonth(),
                clickedDate.getFullYear()
            );
        });
        calendarGrid.appendChild(dayElement);
    }

    // Navigációs gombok eseménykezelői
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        currentDate = new Date(currentWeekStart);
        currentMonth = currentDate.getMonth();
        currentYear = currentDate.getFullYear();
        updateCalendarHeader();
        generateCalendar();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        currentDate = new Date(currentWeekStart);
        currentMonth = currentDate.getMonth();
        currentYear = currentDate.getFullYear();
        updateCalendarHeader();
        generateCalendar();
    });
}

// Havi nézet generálása
function generateMonthView(calendarGrid) {
    // Napnevek hozzáadása (hétfőtől vasárnapig)
    dayNames.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day.substring(0, 3); // Csak az első 3 betű
        calendarGrid.appendChild(dayHeader);
    });

    // Az első nap pozíciójának meghatározása (hétfővel kezdve)
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1; // Vasárnap esetén 6, egyébként napszám - 1
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Üres mezők az első nap előtt
    for (let i = 0; i < firstDayAdjusted; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarGrid.appendChild(emptyDay);
    }

    // Napok generálása
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        
        // Nap szám
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        dayElement.appendChild(dayNumber);

        // Mai nap kiemelése
        if (day === currentDate.getDate() && 
            currentMonth === currentDate.getMonth() && 
            currentYear === currentDate.getFullYear()) {
            dayElement.classList.add('today');
        }

        // Ünnepek kiemelése
        const dateKey = `${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (holidays[dateKey]) {
            dayElement.classList.add('holiday');
            dayElement.title = holidays[dateKey];
        }

        // Napnév hozzáadása
        const dayNameElement = document.createElement('div');
        dayNameElement.className = 'day-name';
        const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();
        const adjustedDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        dayNameElement.textContent = dayNames[adjustedDayIndex];
        dayElement.appendChild(dayNameElement);

        // Események konténer
        const dayEvents = document.createElement('div');
        dayEvents.className = 'day-events';
        dayElement.appendChild(dayEvents);

        // Események számának megjelenítése
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEventCount = events.filter(event => event.date === dateStr).length;
        if (dayEventCount > 0) {
            const countElement = document.createElement('div');
            countElement.className = 'event-count';
            countElement.textContent = dayEventCount;
            dayElement.appendChild(countElement);
        }

        dayElement.addEventListener('click', () => {
            selectedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            showDayDetails(day, currentMonth, currentYear);
        });
        calendarGrid.appendChild(dayElement);
    }

    // Események számának frissítése
    updateEventCounts();
}

// Segédfüggvények
function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
}

function updateWeekTitle() {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    const weekTitle = document.querySelector('.week-title');
    if (weekTitle) {
        weekTitle.textContent = `${currentWeekStart.getFullYear()}. ${monthNames[currentWeekStart.getMonth()]} ${currentWeekStart.getDate()}. - ${weekEnd.getDate()}.`;
    }
}

// Képernyőméret változás figyelése
window.addEventListener('resize', () => {
    generateCalendar();
});

// Események betöltése
async function loadEvents() {
    try {
        const response = await fetch(`${API_URL}/events`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            events = await response.json();
            updateEventCounts();
            if (currentUser) {
                updateWeeklyEvents();
            }
        }
    } catch (error) {
        console.error('Hiba az események betöltésekor:', error);
        events = []; // Hiba esetén üres tömb
    }
}

// Események számának frissítése
function updateEventCounts() {
    const calendarDays = document.querySelectorAll('.calendar-day:not(.empty)');
    calendarDays.forEach(day => {
        const dayNumber = day.querySelector('.day-number')?.textContent;
        if (!dayNumber) return;

        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const dayEvents = events.filter(event => event.date === dateKey);
        
        if (dayEvents.length > 0) {
            let countElement = day.querySelector('.event-count');
            if (!countElement) {
                countElement = document.createElement('div');
                countElement.className = 'event-count';
                day.appendChild(countElement);
            }
            countElement.textContent = dayEvents.length;
        }
    });
}

// Események megjelenítése
function updateWeeklyEvents() {
    const eventsList = document.getElementById('eventsList');
    if (!eventsList || !currentUser) return; // Ha nincs eventsList vagy nincs bejelentkezett felhasználó, kilépünk

    eventsList.innerHTML = '';

    // A jelenlegi hét kezdő és végdátuma (hétfőtől vasárnapig)
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;
    
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Események szűrése a jelenlegi hétre
    const weeklyEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        const eventEndDate = new Date(event.date);
        
        if (event.endTime < event.startTime) {
            eventEndDate.setDate(eventEndDate.getDate() + 1);
        }
        
        return (eventDate >= startOfWeek && eventDate <= endOfWeek) || 
               (eventEndDate >= startOfWeek && eventEndDate <= endOfWeek);
    });

    // Események csoportosítása napok szerint
    const eventsByDay = {};
    weeklyEvents.forEach(event => {
        const eventDate = new Date(event.date);
        const eventEndDate = new Date(event.date);
        
        if (event.endTime < event.startTime) {
            eventEndDate.setDate(eventEndDate.getDate() + 1);
            
            const nextDayEvent = { ...event };
            nextDayEvent.date = eventEndDate.toISOString().split('T')[0];
            nextDayEvent.startTime = '00:00';
            nextDayEvent.isContinued = true;
            nextDayEvent.originalEndTime = event.endTime;
            
            const nextDayKey = nextDayEvent.date;
            if (!eventsByDay[nextDayKey]) {
                eventsByDay[nextDayKey] = [];
            }
            eventsByDay[nextDayKey].push(nextDayEvent);
        }
        
        const dayKey = eventDate.toISOString().split('T')[0];
        if (!eventsByDay[dayKey]) {
            eventsByDay[dayKey] = [];
        }
        eventsByDay[dayKey].push(event);
    });

    // Napok sorrendje
    const days = Object.keys(eventsByDay).sort();

    // Események megjelenítése napok szerint
    days.forEach(day => {
        const dayDate = new Date(day);
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.innerHTML = `
            <h6 class="mb-2">${dayNames[dayDate.getDay()]}, ${dayDate.getDate()}. ${monthNames[dayDate.getMonth()]}</h6>
        `;
        eventsList.appendChild(dayHeader);

        eventsByDay[day].sort((a, b) => {
            const timeA = a.startTime || '';
            const timeB = b.startTime || '';
            return timeA.localeCompare(timeB);
        }).forEach(event => {
            const eventElement = document.createElement('div');
            const isPatrikEvent = event.creator_name === 'Patrik';
            eventElement.className = `event-item ${event.eventType || ''} ${isPatrikEvent ? 'blue' : 'pink'}`;
            
            let timeDisplay = `${event.startTime} - ${event.endTime}`;
            if (event.isContinued) {
                timeDisplay = `00:00 - ${event.originalEndTime} (folytatás)`;
            }
            
            eventElement.innerHTML = `
                <div class="event-time">${timeDisplay}</div>
                <div class="event-title">${event.title}</div>
                ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                <div class="creator">Létrehozta: ${event.creator_name || 'Ismeretlen'}</div>
                ${event.shared_with ? `<div class="shared-with">Megosztva: ${event.shared_with}</div>` : ''}
                ${currentUser && event.creator_id === currentUser.id ? `<button onclick="deleteEvent('${event.id}')" class="btn btn-danger btn-sm">Törlés</button>` : ''}
            `;
            eventsList.appendChild(eventElement);
        });
    });
}

// Nap részleteinek megjelenítése
async function showDayDetails(day, month, year) {
    if (!currentUser) {
        console.error('Nincs bejelentkezett felhasználó');
        return;
    }

    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    selectedDate = dateKey;
    
    const dayEvents = events.filter(event => {
        const eventDate = new Date(event.date);
        const eventEndDate = new Date(event.date);
        
        if (event.endTime < event.startTime) {
            eventEndDate.setDate(eventEndDate.getDate() + 1);
        }
        
        return event.date === dateKey || 
               (eventEndDate.toISOString().split('T')[0] === dateKey && event.endTime < event.startTime);
    });
    
    const modal = document.getElementById('dayDetailsModal');
    const title = document.getElementById('dayDetailsTitle');
    const timeSlots = document.getElementById('timeSlots');
    
    title.textContent = `${year}. ${monthNames[month]} ${day}.`;
    timeSlots.innerHTML = '';
    
    // Órák generálása
    for (let hour = 0; hour < 24; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        
        const hourDisplay = document.createElement('div');
        hourDisplay.className = 'hour';
        hourDisplay.textContent = `${hour.toString().padStart(2, '0')}:00`;
        
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'events';
        
        const hourEvents = dayEvents.filter(event => {
            if (!event.startTime || !event.endTime) return false;
            
            const startHour = parseInt(event.startTime.split(':')[0]);
            let endHour = parseInt(event.endTime.split(':')[0]);
            
            if (event.endTime < event.startTime) {
                endHour = 24;
            }
            
            return hour >= startHour && hour <= endHour;
        });
        
        hourEvents.forEach(event => {
            const eventElement = document.createElement('div');
            const isPatrikEvent = event.creator_name === 'Patrik';
            eventElement.className = `event-item ${event.eventType || ''} ${isPatrikEvent ? 'blue' : 'pink'}`;
            
            let timeDisplay = `${event.startTime} - ${event.endTime}`;
            if (event.isContinued) {
                timeDisplay = `00:00 - ${event.originalEndTime} (folytatás)`;
            }
            
            eventElement.innerHTML = `
                <div class="event-time">${timeDisplay}</div>
                <div class="event-title">${event.title}</div>
                ${event.description ? `<div class="event-description">${event.description}</div>` : ''}
                <div class="creator">Létrehozta: ${event.creator_name}</div>
                ${event.shared_with ? `<div class="shared-with">Megosztva: ${event.shared_with}</div>` : ''}
                ${event.creator_id === currentUser.id ? `<button onclick="deleteEvent('${event.id}')" class="btn btn-danger btn-sm">Törlés</button>` : ''}
            `;
            eventsContainer.appendChild(eventElement);
        });
        
        const addButton = document.createElement('button');
        addButton.className = 'add-event-btn';
        addButton.innerHTML = '<i class="bi bi-plus"></i> Esemény hozzáadása';
        addButton.onclick = () => {
            document.getElementById('newEventModal').style.display = 'block';
            document.getElementById('eventStartTime').value = `${hour.toString().padStart(2, '0')}:00`;
            document.getElementById('eventEndTime').value = `${(hour + 1).toString().padStart(2, '0')}:00`;
        };
        
        timeSlot.appendChild(hourDisplay);
        timeSlot.appendChild(eventsContainer);
        timeSlot.appendChild(addButton);
        timeSlots.appendChild(timeSlot);
    }
    
    modal.style.display = 'block';
}

// Új esemény hozzáadása
async function addEvent(event) {
    event.preventDefault();
    
    const title = document.getElementById('eventTitle')?.value;
    const description = document.getElementById('eventDescription')?.value;
    const eventType = document.getElementById('eventType')?.value;
    const startTime = document.getElementById('eventStartTime')?.value;
    const endTime = document.getElementById('eventEndTime')?.value;
    const isShared = true;
    const sharedWith = [1, 2];
    
    if (!title || !startTime || !endTime) {
        alert('Kérjük, töltse ki az összes kötelező mezőt!');
        return;
    }
    
    if (!selectedDate) {
        alert('Kérjük, válasszon ki egy napot a naptárból!');
        return;
    }
    
    const date = selectedDate;
    
    if (endTime < startTime) {
        try {
            const response1 = await fetch(`${API_URL}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    date,
                    startTime,
                    endTime: '23:59',
                    eventType,
                    is_shared: isShared,
                    shared_with: sharedWith
                }),
                credentials: 'include'
            });

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            const nextDateStr = nextDate.toISOString().split('T')[0];

            const response2 = await fetch(`${API_URL}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title + ' (folytatás)',
                    description,
                    date: nextDateStr,
                    startTime: '00:00',
                    endTime,
                    eventType,
                    is_shared: isShared,
                    shared_with: sharedWith
                }),
                credentials: 'include'
            });

            if (response1.ok && response2.ok) {
                document.getElementById('newEventModal').style.display = 'none';
                document.getElementById('newEventForm').reset();
                await loadEvents();
                updateWeeklyEvents();
                updateEventCounts();
                generateCalendar();
                if (selectedDate) {
                    showDayDetails(parseInt(selectedDate.split('-')[2]), parseInt(selectedDate.split('-')[1]), parseInt(selectedDate.split('-')[0]));
                }
            } else {
                const error = await response1.json() || await response2.json();
                alert(error.error || 'Hiba történt az esemény hozzáadásakor');
            }
        } catch (error) {
            console.error('Hiba:', error);
            alert('Hiba történt az esemény hozzáadásakor');
        }
    } else {
        try {
            const response = await fetch(`${API_URL}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    description,
                    date,
                    startTime,
                    endTime,
                    eventType,
                    is_shared: isShared,
                    shared_with: sharedWith
                }),
                credentials: 'include'
            });
            
            if (response.ok) {
                document.getElementById('newEventModal').style.display = 'none';
                document.getElementById('newEventForm').reset();
                await loadEvents();
                updateWeeklyEvents();
                updateEventCounts();
                generateCalendar();
                if (selectedDate) {
                    showDayDetails(parseInt(selectedDate.split('-')[2]), parseInt(selectedDate.split('-')[1]), parseInt(selectedDate.split('-')[0]));
                }
            } else {
                const error = await response.json();
                alert(error.error || 'Hiba történt az esemény hozzáadásakor');
            }
        } catch (error) {
            console.error('Hiba:', error);
            alert('Hiba történt az esemény hozzáadásakor');
        }
    }
}

// Esemény törlése
async function deleteEvent(id) {
    if (!confirm('Biztosan törölni szeretnéd ezt az eseményt?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/events/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            await loadEvents();
            updateWeeklyEvents();
            updateEventCounts();
            generateCalendar(); // Naptár frissítése
            if (selectedDate) {
                showDayDetails(parseInt(selectedDate.split('-')[2]), parseInt(selectedDate.split('-')[1]), parseInt(selectedDate.split('-')[0])); // Napi nézet frissítése
            }
        } else {
            const error = await response.json();
            alert(error.error || 'Hiba történt az esemény törlésekor');
        }
    } catch (error) {
        console.error('Hiba:', error);
        alert('Hiba történt az esemény törlésekor');
    }
}

// Felhasználók betöltése megosztáshoz
async function loadUsers() {
    // Nem szükséges többé
}

// Bejelentkezés ellenőrzése
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/events`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const userResponse = await fetch(`${API_URL}/user`, {
                credentials: 'include'
            });
            
            if (userResponse.ok) {
                const user = await userResponse.json();
                currentUser = {
                    id: user.id,
                    username: user.username,
                    email: user.email
                };
                document.getElementById('authModal').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';
                initCalendar();
            }
        } else {
            document.getElementById('authModal').style.display = 'block';
            document.getElementById('mainContent').style.display = 'none';
        }
    } catch (error) {
        console.error('Hiba:', error);
        document.getElementById('authModal').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Időválasztók 24 órás formátumának beállítása
    const timeInputs = document.querySelectorAll('input[type="time"]');
    timeInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const time = e.target.value;
            if (time) {
                const [hours, minutes] = time.split(':');
                e.target.value = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
            }
        });
    });

    // Bejelentkezés ellenőrzése
    checkAuth();
    
    // Bejelentkezés
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Naptár navigáció
    const prevMonthBtn = document.getElementById('prevMonth');
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            updateCalendarHeader();
            generateCalendar();
        });
    }
    
    const nextMonthBtn = document.getElementById('nextMonth');
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            updateCalendarHeader();
            generateCalendar();
        });
    }
    
    // Új esemény
    const newEventForm = document.getElementById('newEventForm');
    if (newEventForm) {
        newEventForm.addEventListener('submit', addEvent);
    }
    
    // Modal bezárása
    document.querySelectorAll('.close').forEach(closeBtn => {
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            });
        }
    });
    
    // Értesítések engedélyezése
    if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // Dark mode toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Képernyőméret változás figyelése
    window.addEventListener('resize', () => {
        generateCalendar();
    });

    // Naptár inicializálása
    initCalendar();
});

// Értesítések kezelése
function checkNotifications() {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    events.forEach(event => {
        if (event.date === currentKey) {
            const [hours, minutes] = event.time.split(':');
            const eventTime = new Date();
            eventTime.setHours(parseInt(hours), parseInt(minutes), 0);
            
            const timeDiff = eventTime - now;
            if (timeDiff > 0 && timeDiff <= 15 * 60 * 1000) { // 15 perccel az esemény előtt
                showNotification(event);
            }
        }
    });
}

// Értesítés megjelenítése
function showNotification(event) {
    if (Notification.permission === 'granted') {
        new Notification('Közelgő esemény', {
            body: `${event.title} - ${event.time}`,
            icon: '/icon.png'
        });
    }
}

// Értesítések ellenőrzése percenként
setInterval(checkNotifications, 60000); 