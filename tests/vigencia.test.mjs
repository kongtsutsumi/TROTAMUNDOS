// Pruebas de la vigencia de planes (lib/vigencia.mjs).
import * as V from "../lib/vigencia.mjs";

let passed = 0, failed = 0; const failures = [];
const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; failures.push(`${name}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); } };
const throws = (name, fn) => { try { fn(); failed++; failures.push(`${name}: debía fallar`); } catch (e) { passed++; } };

console.log("▸ Fechas");
eq("addMonths fin de enero", V.addMonths("2026-01-31", 1), "2026-02-28");
eq("addMonths bisiesto", V.addMonths("2028-01-31", 1), "2028-02-29");
eq("addMonths cambia de año", V.addMonths("2026-11-15", 3), "2027-02-15");
eq("periodEnd 1 de mes", V.periodEnd("2026-10-01", 1), "2026-10-31");
eq("periodEnd a mitad de mes", V.periodEnd("2026-10-15", 1), "2026-11-14");
eq("periodEnd 3 meses", V.periodEnd("2026-10-01", 3), "2026-12-31");
eq("periodEnd 31 ene", V.periodEnd("2026-01-31", 1), "2026-02-27");
eq("daysBetween", V.daysBetween("2026-10-17", "2026-10-31"), 14);
eq("daysBetween cruza horario", V.daysBetween("2026-03-01", "2026-04-01"), 31);
eq("isISODate inválida", V.isISODate("2026-02-30"), false);
eq("isISODate válida", V.isISODate("2026-02-28"), true);
eq("todayIn Lima de noche", V.todayIn("America/Lima", new Date("2026-10-18T03:30:00Z")), "2026-10-17");

console.log("▸ Estado");
const m = { start: "2026-10-01", end: "2026-10-31", payments: [] };
eq("sin plan", V.membershipStatus(null, "2026-10-17").status, "none");
eq("vigente", V.membershipStatus(m, "2026-10-17").status, "vigente");
eq("días que quedan", V.membershipStatus(m, "2026-10-17").daysLeft, 14);
eq("por vencer al límite", V.membershipStatus(m, "2026-10-24").status, "por_vencer");
eq("vigente un día antes del aviso", V.membershipStatus(m, "2026-10-23").status, "vigente");
eq("vence hoy es por vencer", V.membershipStatus(m, "2026-10-31").status, "por_vencer");
eq("vence hoy daysLeft 0", V.membershipStatus(m, "2026-10-31").daysLeft, 0);
eq("vencido al día siguiente", V.membershipStatus(m, "2026-11-01").status, "vencido");
eq("aviso configurable", V.membershipStatus(m, "2026-10-17", 14).status, "por_vencer");
eq("texto vence hoy", V.describeStatus(V.membershipStatus(m, "2026-10-31")), "Vence hoy");
eq("texto vencido", V.describeStatus(V.membershipStatus(m, "2026-11-03")), "Venció hace 3 días");

console.log("▸ Pagos");
const now = new Date("2026-10-17T15:00:00Z");
const p1 = V.applyPayment(null, { paidOn: "2026-10-05", months: 1, amount: "150" }, { now, id: "a" });
eq("primer pago empieza el día del pago", [p1.start, p1.end], ["2026-10-05", "2026-11-04"]);
eq("monto numérico", p1.payments[0].amount, 150);
const p2 = V.applyPayment(p1, { paidOn: "2026-10-30", months: 1 }, { now, id: "b" });
eq("renovar antes de vencer encadena", [p2.start, p2.end], ["2026-11-05", "2026-12-04"]);
const p3 = V.applyPayment(p1, { paidOn: "2026-11-04", months: 1 }, { now, id: "c" });
eq("renovar el mismo día del vencimiento encadena", p3.start, "2026-11-05");
const p4 = V.applyPayment(p1, { paidOn: "2026-11-20", months: 2 }, { now, id: "d" });
eq("renovar ya vencido empieza el día del pago", [p4.start, p4.end], ["2026-11-20", "2027-01-19"]);
const p5 = V.applyPayment(p1, { paidOn: "2026-10-30", months: 1, from: "2026-11-01" }, { now, id: "e" });
eq("inicio a mano", [p5.start, p5.end], ["2026-11-01", "2026-11-30"]);
const p6 = V.applyPayment(p2, { paidOn: "2026-09-01", months: 1, from: "2026-09-01" }, { now, id: "f" });
eq("pago viejo no acorta la vigencia", p6.end, "2026-12-04");
eq("historial", p6.payments.length, 3);
throws("meses inválidos", () => V.applyPayment(null, { paidOn: "2026-10-01", months: 0 }));
throws("13 meses", () => V.applyPayment(null, { paidOn: "2026-10-01", months: 13 }));
throws("fecha inválida", () => V.applyPayment(null, { paidOn: "2026-13-01", months: 1 }));
throws("monto negativo", () => V.applyPayment(null, { paidOn: "2026-10-01", months: 1, amount: -5 }));
eq("no modifica el original", p1.payments.length, 1);

console.log("▸ Corregir");
const r = V.recomputeFromPayments({ ...p2, payments: p2.payments.filter((p) => p.id !== "b") });
eq("borrar el último pago vuelve al anterior", [r.start, r.end], ["2026-10-05", "2026-11-04"]);
const r0 = V.recomputeFromPayments({ ...p1, payments: [] });
eq("sin pagos queda sin plan", V.membershipStatus(r0, "2026-10-17").status, "none");
eq("fechas a mano", V.setDates(p1, { start: "2026-10-05", end: "2026-11-10" }).end, "2026-11-10");
throws("inicio después del fin", () => V.setDates(p1, { start: "2026-12-01", end: "2026-11-10" }));

console.log("▸ Vigencia inicial de TROTAMUNDOS (todos hasta el 30/11/2026)");
const ini = V.membresiaInicial();
eq("vence el 30 de noviembre", ini.end, "2026-11-30");
eq("no aparece como pago", ini.payments.length, 0);
eq("el 27/10 está vigente", V.membershipStatus(ini, "2026-10-27").status, "vigente");
eq("el 25/11 está por vencer", V.membershipStatus(ini, "2026-11-25").status, "por_vencer");
eq("el 1/12 está vencido", V.membershipStatus(ini, "2026-12-01").status, "vencido");
const dic = V.applyPayment(ini, { paidOn: "2026-11-28", months: 1, amount: 150 }, { id: "d" });
eq("pagar antes del 30/11 cubre diciembre entero", [dic.start, dic.end], ["2026-12-01", "2026-12-31"]);
const tarde = V.applyPayment(ini, { paidOn: "2026-12-05", months: 1 }, { id: "t" });
eq("pagar tarde cuenta desde el día del pago", [tarde.start, tarde.end], ["2026-12-05", "2027-01-04"]);
const deshecho = V.recomputeFromPayments({ ...dic, payments: [] });
eq("borrar ese pago vuelve al 30/11, no a 'sin plan'", deshecho.end, "2026-11-30");
eq("…y sigue conservando la base", deshecho.base?.end, "2026-11-30");

console.log("\n" + "─".repeat(52));
if (failed) { console.log(`✗ ${failed} fallaron de ${passed + failed}`); failures.forEach((f) => console.log("  · " + f)); process.exit(1); }
console.log(`✓ ${passed} verificaciones, todas correctas.`);
