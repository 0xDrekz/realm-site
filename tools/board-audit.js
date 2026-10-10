/* Before paying anything for the weekly board, run this.  node tools/board-audit.js [week] [dir]
   It lists the clean ranking and every wallet dropped (shared a being, or passed $DMT to another). */
"use strict";
const dir = process.argv[3] || process.env.SNAPSHOT_DIR || require("path").join(__dirname, "..", "snapshot-data");
const g = require("../tcg2/game").create({ dir });
const a = g.audit(process.argv[2]);
console.log(`week of ${a.week}`);
console.log("\nCLEAN"); a.clean.forEach((r, i) => console.log(`  ${String(i + 1).padStart(3)}  ${r.wallet}  ${r.points} pts  ${r.wins} wins`));
console.log("\nDROPPED"); a.dropped.forEach(r => console.log(`  ${r.wallet}  ${r.points} pts  -- ${r.dropped.join("; ")}`));
