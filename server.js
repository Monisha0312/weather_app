const express = require('express');
const https = require('https');
const path = require('path');

require('dotenv').config();

const API_KEY = process.env.OPENWEATHER_API_KEY;
const PORT = process.env.PORT || 3000;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', (err) => reject(err));
  });
}

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Serve Leaflet from node_modules
app.use('/leaflet.css', express.static(path.join(__dirname, 'node_modules/leaflet/dist/leaflet.css')));
app.use('/leaflet.js', express.static(path.join(__dirname, 'node_modules/leaflet/dist/leaflet.js')));

app.get('/api/weather', (req, res) => {
  const city = req.query.city || 'London';
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  fetchJson(url)
    .then(data => res.json(data))
    .catch(() => res.status(500).json({ error: 'Failed to fetch weather' }));
});

// Forecast endpoint: returns hourly (next ~24h in 3-hour steps) and next 2 days summary
app.get('/api/forecast', (req, res) => {
  const city = req.query.city || 'London';
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  fetchJson(url)
    .then(data => {
      if (!data || !data.list) return res.status(500).json({ error: 'Invalid forecast data' });

      // hourly (next 24h): take first 8 entries (3-hour intervals => ~24h)
      const hourly = data.list.slice(0, 8).map(it => ({
        dt: it.dt,
        dt_txt: it.dt_txt,
        temp: it.main && it.main.temp,
        weather: it.weather && it.weather[0]
      }));

      // next 2 days summary (group by date, skip today's date)
      const groups = {};
      data.list.forEach(it => {
        const date = it.dt_txt.split(' ')[0];
        if (!groups[date]) groups[date] = [];
        groups[date].push(it);
      });

      const today = new Date().toISOString().split('T')[0];
      const futureDates = Object.keys(groups).filter(d => d > today).slice(0, 2);
      const next2days = futureDates.map(date => {
        const items = groups[date];
        let max = -Infinity, min = Infinity;
        const weatherCount = {};
        const iconForKey = {};
        items.forEach(it => {
          const t = it.main && it.main.temp;
          if (typeof t === 'number') {
            if (t > max) max = t;
            if (t < min) min = t;
          }
          const wobj = it.weather && it.weather[0];
          const desc = wobj && wobj.description;
          const icon = wobj && wobj.icon;
          const key = `${icon||''}|${desc||''}`;
          if (desc) {
            weatherCount[key] = (weatherCount[key] || 0) + 1;
            iconForKey[key] = icon;
          }
        });
        // pick most frequent description/icon combo
        const bestKey = Object.keys(weatherCount).sort((a,b)=> weatherCount[b]-weatherCount[a])[0] || '';
        const [bestIcon, bestDesc] = bestKey.split('|');
        return { date, max: isFinite(max) ? max : null, min: isFinite(min) ? min : null, weather: bestDesc || '', icon: bestIcon || '' };
      });

      res.json({ city: data.city, hourly24: hourly, next2days });
    })
    .catch(() => res.status(500).json({ error: 'Failed to fetch forecast' }));
});

// 7-day forecast using One Call API: fetch city coords then call onecall
// Helper: ensure temps are in Celsius. Some older endpoints return Kelvin values.
function maybeConvertTempsToCelsius(tempObj) {
  if (!tempObj || typeof tempObj !== 'object') return tempObj;
  // if values look like Kelvin (e.g. >200), convert them
  const keys = Object.keys(tempObj);
  // find a numeric value to check
  let sample = null;
  for (const k of keys) {
    const v = tempObj[k];
    if (typeof v === 'number') { sample = v; break; }
  }
  if (sample === null) return tempObj;
  const isKelvin = sample > 200; // heuristic
  if (!isKelvin) return tempObj;
  const out = {};
  for (const k of keys) {
    const v = tempObj[k];
    out[k] = (typeof v === 'number') ? Number((v - 273.15).toFixed(2)) : v;
  }
  return out;
}

function normalizeDailyResponse(resp) {
  // resp may be OneCall { daily: [...] } or older format { list: [...], city: {...} }
  if (!resp) return null;
  if (resp.daily && Array.isArray(resp.daily)) {
    return resp.daily.slice(0, 7).map(d => ({
      dt: d.dt,
      date: new Date(d.dt * 1000).toISOString().split('T')[0],
      temp: maybeConvertTempsToCelsius(d.temp),
      weather: d.weather && d.weather[0] ? d.weather[0].description : '',
      main: d.weather && d.weather[0] ? d.weather[0].main : '',
      icon: d.weather && d.weather[0] ? d.weather[0].icon : ''
    }));
  }

  if (Array.isArray(resp.list) && resp.list.length) {
    return resp.list.slice(0, 7).map(d => ({
      dt: d.dt,
      date: new Date(d.dt * 1000).toISOString().split('T')[0],
      temp: maybeConvertTempsToCelsius(d.temp || {}),
      weather: d.weather && d.weather[0] ? d.weather[0].description : '',
      main: d.weather && d.weather[0] ? d.weather[0].main : '',
      icon: d.weather && d.weather[0] ? d.weather[0].icon : ''
    }));
  }

  return null;
}

app.get('/api/forecast7', (req, res) => {
  const city = req.query.city || 'London';
  // first try to call the One Call API via resolved coordinates (preferred)
  const urlCurrent = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  fetchJson(urlCurrent)
    .then(curr => {
      if (!curr || !curr.coord) return res.status(500).json({ error: 'Failed to resolve city coordinates' });
      const { lat, lon } = curr.coord;
      const urlOne = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&appid=${API_KEY}`;
      return fetchJson(urlOne).then(one => ({ curr, one }));
    })
    .then(({ curr, one }) => {
      // normalize both OneCall and older 'daily list' formats
      let days = normalizeDailyResponse(one) || normalizeDailyResponse({ list: one && one.list });
      // fallback: if normalization failed, try fetching deprecated daily endpoint
      if (!days) {
        const urlDaily = `https://api.openweathermap.org/data/2.5/forecast/daily?q=${encodeURIComponent(city)}&cnt=7&appid=${API_KEY}`;
        return fetchJson(urlDaily).then(dailyResp => {
          days = normalizeDailyResponse(dailyResp);
          res.json({ city: dailyResp.city || (curr.name ? { name: curr.name, coord: curr.coord } : null), daily: days || [] });
        });
      }

      res.json({ city: curr.name ? { name: curr.name, coord: curr.coord } : null, daily: days });
    })
    .catch(() => res.status(500).json({ error: 'Failed to fetch 7-day forecast' }));
});

// 5-day forecast endpoint (same approach as forecast7 but returns 5 days)
app.get('/api/forecast5', (req, res) => {
  const city = req.query.city || 'London';
  const urlCurrent = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  fetchJson(urlCurrent)
    .then(curr => {
      if (!curr || !curr.coord) return res.status(500).json({ error: 'Failed to resolve city coordinates' });
      const { lat, lon } = curr.coord;
      const urlOne = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&appid=${API_KEY}`;
      return fetchJson(urlOne).then(one => ({ curr, one }));
    })
    .then(({ curr, one }) => {
      // normalize various possible response shapes
      let days = normalizeDailyResponse(one);
      if (!days) {
        // attempt to fetch deprecated daily endpoint as a fallback
        const urlDaily = `https://api.openweathermap.org/data/2.5/forecast/daily?q=${encodeURIComponent(city)}&cnt=5&appid=${API_KEY}`;
        return fetchJson(urlDaily).then(dailyResp => {
          days = normalizeDailyResponse(dailyResp);
          res.json({ city: dailyResp.city || (curr.name ? { name: curr.name, coord: curr.coord } : null), daily: days || [] });
        });
      }
      days = days.slice(0, 5);
      res.json({ city: curr.name ? { name: curr.name, coord: curr.coord } : null, daily: days });
    })
    .catch(() => res.status(500).json({ error: 'Failed to fetch 5-day forecast' }));
});

if (!API_KEY) {
  console.warn('Warning: OPENWEATHER_API_KEY is not set. Weather API requests will fail unless you set it in .env or the environment.');
}

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));