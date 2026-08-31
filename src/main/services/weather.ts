import type { WeatherState } from "../../shared/desktop";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

interface GeocodeItem {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface ForecastPayload {
  current_weather?: {
    temperature: number;
    weathercode: number;
    humidity?: number;
  };
  hourly?: {
    time?: string[];
    relativehumidity_2m?: number[];
    uv_index?: number[];
  };
}

function weatherCodeText(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷暴";
  return "未知天气";
}

export class WeatherService {
  private readonly listeners = new Set<(state: WeatherState) => void>();
  private state: WeatherState = {
    status: "idle",
    city: "未配置",
    temperature: null,
    weatherText: "待加载",
    humidity: null,
    uvIndex: null,
    updatedAt: null,
  };
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly fetch: typeof globalThis.fetch;
  private preferredCity: string | null = null;

  constructor(options: { fetch?: typeof globalThis.fetch } = {}) {
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  getState(): WeatherState {
    return { ...this.state };
  }

  subscribe(listener: (state: WeatherState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(intervalMinutes = 10): void {
    this.stop();
    void this.refresh();
    this.refreshTimer = setInterval(() => { void this.refresh(); }, Math.max(60_000, intervalMinutes * 60_000));
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<WeatherState> {
    this.setState({ ...this.state, status: "loading" });
    try {
      const location = await this.resolveLocation();
      if (!location) {
        return this.setState({
          status: "error",
          city: "未配置",
          temperature: null,
          weatherText: "在设置中填写城市名后即可加载",
          humidity: null,
          uvIndex: null,
          message: "无法解析城市，使用默认占位。",
          updatedAt: new Date().toISOString(),
        });
      }
      const url = new URL(OPEN_METEO_FORECAST);
      url.searchParams.set("latitude", String(location.latitude));
      url.searchParams.set("longitude", String(location.longitude));
      url.searchParams.set("current_weather", "true");
      url.searchParams.set("hourly", "relativehumidity_2m,uv_index");
      url.searchParams.set("timezone", "auto");
      const response = await this.fetch(url.toString());
      if (!response.ok) throw new Error(`天气接口返回 ${response.status}`);
      const payload = (await response.json()) as ForecastPayload;
      const current = payload.current_weather;
      const humidity = payload.hourly?.relativehumidity_2m?.[0] ?? null;
      const uv = payload.hourly?.uv_index?.[0] ?? null;
      return this.setState({
        status: "ok",
        city: location.admin1 ? `${location.name} · ${location.admin1}` : location.name,
        temperature: current?.temperature ?? null,
        weatherText: current ? weatherCodeText(current.weathercode) : "待加载",
        humidity: humidity ?? null,
        uvIndex: typeof uv === "number" ? Math.round(uv) : null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.setState({
        ...this.state,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  setPreferredCity(name: string | null): void {
    this.preferredCity = name ? name.trim() || null : null;
    void this.refresh();
  }

  private async resolveLocation(): Promise<GeocodeItem | null> {
    const name = this.preferredCity;
    if (!name) return null;
    const url = new URL(OPEN_METEO_GEOCODE);
    url.searchParams.set("name", encodeURIComponent(name));
    url.searchParams.set("count", "1");
    url.searchParams.set("format", "json");
    try {
      const response = await this.fetch(url.toString());
      if (!response.ok) return null;
      const payload = (await response.json()) as { results?: GeocodeItem[] };
      return payload.results?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private setState(next: WeatherState): WeatherState {
    this.state = next;
    const snapshot = { ...next };
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}
