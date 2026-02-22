document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('searchForm');
  const cityInput = document.getElementById('cityInput');
  const current = document.getElementById('current');
  const hourlyEl = document.getElementById('hourly');
  const next2El = document.getElementById('next2');
  const themeToggle = document.getElementById('themeToggle');

  // Theme handling: read saved theme and apply
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark');
      themeToggle.textContent = '☀️';
    } else {
      document.body.classList.remove('dark');
      themeToggle.textContent = '🌙';
    }
    try { localStorage.setItem('theme', theme); } catch(e){}
  }

  const saved = (function(){try{return localStorage.getItem('theme')}catch(e){return null}})();
  applyTheme(saved === 'dark' ? 'dark' : 'light');

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark');
    applyTheme(isDark ? 'light' : 'dark');
  });

  // Accent and high-contrast controls
  const accentControl = document.getElementById('accentControl');
  const contrastToggle = document.getElementById('contrastToggle');
  function setAccent(color) {
    if (!color) return;
    if (color === '--accent') {
      // restore default variable
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-strong');
      return;
    }
    document.documentElement.style.setProperty('--accent', color);
    // compute a stronger variant for hover/active
    try {
      // tiny brightness adjust: if hex, compute darker
      const c = color.replace('#','');
      if (c.length === 6) {
        const r = parseInt(c.substring(0,2),16);
        const g = parseInt(c.substring(2,4),16);
        const b = parseInt(c.substring(4,6),16);
        const darker = (n)=>Math.max(0,Math.round(n*0.78));
        const dr = darker(r).toString(16).padStart(2,'0');
        const dg = darker(g).toString(16).padStart(2,'0');
        const db = darker(b).toString(16).padStart(2,'0');
        document.documentElement.style.setProperty('--accent-strong', `#${dr}${dg}${db}`);
      }
    } catch (e) {}
    try { localStorage.setItem('accent', color); } catch(e){}
  }

  function setContrast(on) {
    if (on) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
    try { localStorage.setItem('contrast', on ? '1' : '0'); } catch(e){}
  }

  if (accentControl) {
    accentControl.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.swatch');
      if (!btn) return;
      const color = btn.getAttribute('data-accent');
      setAccent(color);
      // animate briefly
      btn.classList.add('pulse');
      setTimeout(()=>btn.classList.remove('pulse'), 900);
    });
    // restore saved
    try {
      const savedAccent = localStorage.getItem('accent');
      if (savedAccent) setAccent(savedAccent);
    } catch(e){}
  }

  if (contrastToggle) {
    contrastToggle.addEventListener('click', ()=>{
      const isOn = document.body.classList.contains('high-contrast');
      setContrast(!isOn);
      contrastToggle.classList.add('pulse');
      setTimeout(()=>contrastToggle.classList.remove('pulse'),600);
    });
    try { if (localStorage.getItem('contrast') === '1') setContrast(true); } catch(e){}
  }

  function showMessage(msg) {
    current.innerHTML = `<div class="muted">${msg}</div>`;
  }

  function renderWeather(data) {
    if (!data || data.cod && data.cod !== 200) {
      showMessage(data && data.message ? data.message : 'No data');
      return;
    }
    const html = `
      <div class="row">
        <div>
          <div class="muted">${data.name}, ${data.sys && data.sys.country ? data.sys.country : ''}</div>
          <div class="row" style="align-items:center;gap:12px">
            <div class="temp">${Math.round(data.main.temp)}°C</div>
            ${data.weather && data.weather[0] && data.weather[0].icon ? `<img class="weather-icon" src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="icon"/>` : ''}
          </div>
          <div class="muted">${data.weather && data.weather[0] ? data.weather[0].description : ''}</div>
        </div>
        <div class="muted">
          Humidity: ${data.main.humidity}%<br />
          Wind: ${data.wind.speed} m/s
        </div>
      </div>
    `;
    current.innerHTML = html;
  }

  function renderHourly(data) {
    if (!data || !data.length) {
      hourlyEl.innerHTML = '<div class="muted">No hourly data</div>';
      return;
    }
    hourlyEl.innerHTML = data.map(it => {
      const date = new Date(it.dt * 1000);
      // 12-hour format with AM/PM
      const hours = date.getHours();
      const hours12 = hours % 12 === 0 ? 12 : hours % 12;
      const ampm = hours < 12 ? 'AM' : 'PM';
      const label = `${hours12}:00 ${ampm}`;
      const desc = it.weather && it.weather.description ? it.weather.description : '';
      const icon = it.weather && it.weather.icon ? it.weather.icon : '';
      return `
        <div class="hour">
          <div class="hour-time">${label}</div>
          ${icon ? `<img class="weather-icon" src="https://openweathermap.org/img/wn/${icon}.png" alt="icon"/>` : ''}
          <div class="hour-temp">${Math.round(it.temp)}°C</div>
          <div class="hour-desc muted">${desc}</div>
        </div>
      `;
    }).join('');
  }

  function renderNext2(data) {
    if (!data || !data.length) {
      next2El.innerHTML = '<div class="muted">No data</div>';
      return;
    }
    next2El.innerHTML = data.map(d => {
      const date = new Date(d.date);
      const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return `
        <div class="day">
          <div style="display:flex;align-items:center;gap:8px">
            ${d.icon ? `<img class="weather-icon" src="https://openweathermap.org/img/wn/${d.icon}.png" alt="icon"/>` : ''}
            <div class="day-label">${label}</div>
          </div>
          <div class="day-weather muted">${d.weather}</div>
          <div class="day-temps">${d.max ? Math.round(d.max) : '-'}° / ${d.min ? Math.round(d.min) : '-'}°</div>
        </div>
      `;
    }).join('');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (!city) {
      showMessage('Enter a city');
      return;
    }
    showMessage('Loading...');
    // fetch current, 3-hour forecast and 7-day forecast in parallel
    Promise.all([
      fetch(`/api/weather?city=${encodeURIComponent(city)}`).then(r=>r.json()),
      fetch(`/api/forecast?city=${encodeURIComponent(city)}`).then(r=>r.json()),
      fetch(`/api/forecast5?city=${encodeURIComponent(city)}`).then(r=>r.json())
    ]).then(([currentData, forecastData, forecast7]) => {
      renderWeather(currentData);
      renderHourly(forecastData.hourly24 || []);
      renderNext2(forecastData.next2days || []);
      renderWeekly(forecast7.daily || []);
      // set background based on current condition
      const cond = currentData && currentData.weather && currentData.weather[0] && currentData.weather[0].main ? currentData.weather[0].main.toLowerCase() : '';
      applyWeatherBg(cond);
      // initialize map if we have coords — pass temperatures array for gradient
      if (forecast7.city && forecast7.city.coord) {
        const daily = Array.isArray(forecast7.daily) ? forecast7.daily : [];
        const temps = daily.map(d => {
          if (!d) return null;
          if (d.temp && typeof d.temp === 'object') return (typeof d.temp.day === 'number') ? d.temp.day : (d.temp.max || d.temp.min || null);
          if (typeof d.temp === 'number') return d.temp;
          return null;
        }).filter(v => v !== null && v !== undefined);
        initMap(forecast7.city.coord.lat, forecast7.city.coord.lon, temps);
      }
    }).catch(() => showMessage('Failed to fetch weather'));
  });

  // render weekly 7-day forecast (date first, then weather)
  function renderWeekly(data) {
    if (!data || !data.length) {
      document.getElementById('weekly').innerHTML = '<div class="muted">No data</div>';
      return;
    }
    document.getElementById('weekly').innerHTML = data.map(d => {
      const date = new Date(d.date);
      const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      return `
        <div class="week-day card-small">
          <div class="week-date">${label}</div>
          <div class="week-weather">${d.weather}</div>
          <div class="week-temps muted">${d.temp && d.temp.max ? Math.round(d.temp.max) : '-'}° / ${d.temp && d.temp.min ? Math.round(d.temp.min) : '-'}°</div>
        </div>
      `;
    }).join('');
  }

  // apply weather-based background classes
  function applyWeatherBg(cond) {
    document.body.classList.remove('bg-sunny','bg-clouds','bg-rain','bg-snow');
    if (!cond) return;
    if (cond.includes('rain') || cond.includes('drizzle') || cond.includes('thunder')) document.body.classList.add('bg-rain');
    else if (cond.includes('cloud')) document.body.classList.add('bg-clouds');
    else if (cond.includes('snow')) document.body.classList.add('bg-snow');
    else document.body.classList.add('bg-sunny');
  }

  // map initialization using Leaflet (loaded from node_modules)
  let mapInstance = null;
  let tempLayer = null;
  let legendControl = null;

  function tempToColor(v, vmin, vmax) {
    // map v in [vmin, vmax] to a color from blue -> cyan -> yellow -> red
    if (v === null || v === undefined) return '#999999';
    if (vmax === vmin) return '#ffb400';
    const t = (v - vmin) / (vmax - vmin);
    // color stops
    const stops = [
      { t: 0.0, c: [59, 76, 192] },   // deep blue
      { t: 0.33, c: [0, 172, 193] },  // cyan
      { t: 0.66, c: [255, 203, 84] }, // yellow
      { t: 1.0, c: [220, 53, 69] }    // red
    ];
    let left = stops[0], right = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i].t && t <= stops[i+1].t) {
        left = stops[i]; right = stops[i+1]; break;
      }
    }
    const localT = (t - left.t) / (right.t - left.t);
    const rc = [0,0,0].map((_,i) => Math.round(left.c[i] + (right.c[i]-left.c[i]) * localT));
    return `rgb(${rc[0]},${rc[1]},${rc[2]})`;
  }

  function addLegend(min, max) {
    // remove previous legend
    if (legendControl) { legendControl.remove(); legendControl = null; }
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'temp-legend card');
      const gradId = 'temp-gradient-legend';
      // create a gradient using inline style from min to max colors
      const colorMin = tempToColor(min, min, max);
      const colorMax = tempToColor(max, min, max);
      div.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px">Temperature</div>
        <div class=\"temp-legend-bar\" style=\"background: linear-gradient(90deg, ${colorMin} 0%, ${colorMax} 100%);\"></div>
        <div style=\"display:flex;justify-content:space-between;margin-top:6px;font-size:12px\"><span>${Math.round(min)}°C</span><span>${Math.round(max)}°C</span></div>
      `;
      return div;
    };
    legendControl.addTo(mapInstance);
  }

  function initMap(lat, lon, tempsArray) {
    try {
      if (!window.L) return;
      if (!mapInstance) {
        mapInstance = L.map('map', { zoomControl: false }).setView([lat, lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);
        // Ensure map renders properly
        setTimeout(() => mapInstance.invalidateSize(), 100);
      } else {
        mapInstance.setView([lat, lon], 10);
        mapInstance.invalidateSize();
      }

      // remove previous temp layer
      if (tempLayer) { tempLayer.remove(); tempLayer = null; }

      // tempsArray is expected to be an array of numbers (one per day) or a single number
      let temps = [];
      if (Array.isArray(tempsArray) && tempsArray.length) temps = tempsArray.map(v => typeof v === 'number' ? v : null);
      else if (typeof tempsArray === 'number') temps = [tempsArray];

      let min = Infinity, max = -Infinity;
      temps.forEach(t => { if (t !== null && t !== undefined) { min = Math.min(min, t); max = Math.max(max, t); } });
      if (min === Infinity) { min = -10; max = 30; } // fallback range

      // add a circle marker at the city position colored by the first temperature value (or average)
      let markerTemp = temps.length ? (temps[0]) : null;
      if (!markerTemp && temps.length) markerTemp = temps[0];
      const color = tempToColor(markerTemp !== null ? markerTemp : (min + (max-min)/2), min, max);

      tempLayer = L.layerGroup().addTo(mapInstance);
      const circle = L.circleMarker([lat, lon], {
        radius: 12,
        fillColor: color,
        color: '#222',
        weight: 1,
        fillOpacity: 0.85
      }).addTo(tempLayer);
      circle.bindPopup(`<strong>${markerTemp !== null ? Math.round(markerTemp) + '°C' : 'N/A'}</strong>`);

      // if we have a temps array for days, add small numbered markers around the city showing day colors
      if (temps.length > 1) {
        const angleStep = 360 / temps.length;
        const radiusMeters = 8000; // spread markers around
        temps.forEach((t, idx) => {
          if (t === null || t === undefined) return;
          const angle = (idx * angleStep) * Math.PI / 180;
          // approximate offset using simple lat/lon meters conversion (~111km per deg lat)
          const dy = (Math.cos(angle) * radiusMeters) / 111000; // degrees lat
          const dx = (Math.sin(angle) * radiusMeters) / (111000 * Math.cos(lat * Math.PI/180));
          const lat2 = lat + dy;
          const lon2 = lon + dx;
          const c = tempToColor(t, min, max);
          const m = L.circleMarker([lat2, lon2], { radius: 8, fillColor: c, color: '#000', weight: 0.6, fillOpacity: 0.9 }).addTo(tempLayer);
          m.bindTooltip(`Day ${idx+1}: ${Math.round(t)}°C`, { permanent: false, direction: 'top' });
        });
      }

      addLegend(min, max);

    } catch (e) {
      console.warn('Map initialization error:', e);
    }
  }
});