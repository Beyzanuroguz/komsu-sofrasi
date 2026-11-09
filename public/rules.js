export const categories = ["Ana yemek", "Hamur işi", "Tatlı", "Meze"];
export const units = ["adet", "porsiyon", "paket", "250 g", "500 g", "kg", "tepsi", "kavanoz"];
export const unitOf = item => units.includes(item.unit) ? item.unit : "adet";
export const quantityStep = item => unitOf(item) === "kg" ? 0.5 : 1;
export const validQuantity = (value, item) => Number.isFinite(value) && Number.isSafeInteger(value / quantityStep(item));
export const closedStatuses = ["Tamamlandı", "İptal", "Reddedildi"];
export const slots = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
const istanbulClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone:"Europe/Istanbul", year:"numeric", month:"2-digit", day:"2-digit",
  hour:"2-digit", minute:"2-digit", hourCycle:"h23",
});
export function turkeyNow() {
  const values = Object.fromEntries(istanbulClock.formatToParts().map(part => [part.type, part.value]));
  return {date:`${values.year}-${values.month}-${values.day}`, time:`${values.hour}:${values.minute}`};
}
export function lastDeliveryDate(today) {
  const date = new Date(today + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}
export function availableSlots(date, now = turkeyNow()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < now.date || date > lastDeliveryDate(now.date)) return [];
  const day = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(day.valueOf()) || day.toISOString().slice(0, 10) !== date) return [];
  return slots.filter(slot => date !== now.date || slot > now.time);
}
