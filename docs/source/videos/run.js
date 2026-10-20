const L = require("./lib");
const OPS = require("./ops");
(async () => {
  const ids = process.argv.slice(2);
  const pick = ids.length ? Object.keys(OPS).filter((k) => ids.some((i) => k.startsWith(i))) : Object.keys(OPS);
  for (const k of pick) {
    const t0 = Date.now();
    try { const f = await OPS[k](); console.log(`✓ ${k} → ${f} (${Math.round((Date.now() - t0) / 1000)}s)`); }
    catch (e) {
      const where = (e.stack || "").split("\n").find((l) => l.includes("ops.js")) || "";
      let png = ""; try { png = await L.shot(L.current, `fail-${k}`); } catch { /* page gone */ }
      console.log(`✗ ${k}: ${e.message.split("\n")[0]} ${where.trim()} ${png}`); process.exitCode = 1;
    }
  }
  await L.close();
})();
