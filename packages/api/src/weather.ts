/**
 * Weather — Open-Meteo API (completely free, no API key needed)
 *
 * Provides current weather and 7-day forecast for any location.
 */

interface WeatherCurrent {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  icon: string;
}

interface WeatherForecast {
  date: string;
  maxTemp: number;
  minTemp: number;
  condition: string;
  precipitation: number;
}

// WMO Weather interpretation codes → human-readable
const WMO_CODES: Record<number, string> = {
  0: "맑음",
  1: "대체로 맑음",
  2: "부분 흐림",
  3: "흐림",
  45: "안개",
  48: "안개(서리)",
  51: "약한 이슬비",
  53: "이슬비",
  55: "강한 이슬비",
  61: "약한 비",
  63: "비",
  65: "강한 비",
  71: "약한 눈",
  73: "눈",
  75: "강한 눈",
  80: "약한 소나기",
  81: "소나기",
  82: "강한 소나기",
  95: "뇌우",
  96: "우박 뇌우",
  99: "강한 우박 뇌우",
};

async function geocode(
  location: string,
): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=ko`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string; country: string }>;
  };

  if (!data.results || data.results.length === 0) return null;

  const r = data.results[0];
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` };
}

export async function getWeather(
  location: string,
): Promise<
  { location: string; current: WeatherCurrent; forecast: WeatherForecast[] } | { error: string }
> {
  const geo = await geocode(location);
  if (!geo) return { error: `위치를 찾을 수 없습니다: ${location}` };

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum" +
    "&timezone=Asia/Seoul&forecast_days=7";

  const res = await fetch(url);
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
  };

  const c = data.current;
  const current: WeatherCurrent = {
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    condition: WMO_CODES[c.weather_code] || "알 수 없음",
    icon: c.weather_code <= 3 ? "☀️" : c.weather_code <= 48 ? "🌫️" : c.weather_code <= 67 ? "🌧️" : "❄️",
  };

  const forecast: WeatherForecast[] = data.daily.time.map((date, i) => ({
    date,
    maxTemp: data.daily.temperature_2m_max[i],
    minTemp: data.daily.temperature_2m_min[i],
    condition: WMO_CODES[data.daily.weather_code[i]] || "알 수 없음",
    precipitation: data.daily.precipitation_sum[i],
  }));

  return { location: geo.name, current, forecast };
}

export const WEATHER_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description:
        "Get current weather and 7-day forecast for a location. Supports any city name worldwide. Use when user asks about weather, temperature, or if they should bring an umbrella.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name (e.g. '서울', 'Tokyo', 'New York')",
          },
        },
        required: ["location"],
      },
    },
  },
];
