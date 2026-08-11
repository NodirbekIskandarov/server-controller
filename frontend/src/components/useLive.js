import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { connected, disconnected, tick } from "../store/liveSlice";

/**
 * SSE ulanishi. Butun ilovada BITTA marta chaqiriladi (Layout ichida) —
 * har bir sahifa o'z ulanishini ochsa server bir necha oqim ushlab
 * turishga majbur bo'lardi.
 *
 * EventSource uzilishda o'zi qayta ulanadi; biz faqat holatni belgilaymiz.
 */
export function useLive() {
  const dispatch = useDispatch();

  useEffect(() => {
    const source = new EventSource("/api/live", { withCredentials: true });

    source.onopen = () => dispatch(connected());
    source.onmessage = (event) => {
      try {
        dispatch(tick(JSON.parse(event.data)));
      } catch {
        /* buzuq xabar — o'tkazib yuboramiz */
      }
    };
    source.onerror = () => dispatch(disconnected("Ulanish uzildi, qayta ulanmoqda…"));

    return () => source.close();
  }, [dispatch]);
}
