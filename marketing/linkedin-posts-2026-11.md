# VR Alucast — LinkedIn posts, November 2026

Built from live VRA DMS data (backup exported 7 Nov 2026). Production data
starts 1 Sep 2026, so month-on-month comparisons are **Sept vs Oct**.
November has only 5 days of data, so it is not quoted.

To refresh these numbers any month, run:
`node marketing/linkedin_metrics.js <backup.json> [YYYY-MM]` (see the header of that file).

**Posting plan:** 2–3 posts a week. Suggested order: 1 → 3 → 4 → 2 → 5 → 6 → 7 → 8, then post #9 (the monthly scorecard) in the first week of every month.

---

## ✅ Check before posting

1. **Customer names**: none of these posts name a customer. Keep it that way unless the customer agrees in writing.
2. **Post 6 (customer ratings)**: Valiant Alucast and Versatile Alucast both submitted Q3 feedback. If they are group or sister companies, leave them out (the post already does). If they are independent customers, you can quote all 5 responses instead: overall 8.8 / quality 8.8 / delivery 8.8 / communication 9.2 / pricing 8.0.
3. **Post 1**: September OEE leaves out 7 shifts. Those shifts ran parts that had no target cycle time in the Part Master yet, so the system couldn't calculate their Performance. Counting them would show 64.5% and make the jump look bigger than it really is. Use the honest figure: **73.7% → 76.7%**.
4. **Post 5**: the link between the CAPA finding "WI/checklist not updated" and building the new Work Instructions module is my reading of the timeline. Change the wording if that's not how it happened.
5. **Post 3**: add how long ago you started the DMS and how many updates you've shipped, if you want a sharper hook. I couldn't confirm either from the repository.
6. **Photos**: use real shop-floor photos (the machine, the team, a DMS screen on a tablet). Blur customer part numbers and drawings.

---

## Post 1: We crossed our OEE target (and what's still holding us back)

> In September our die casting OEE was 73.7%.
> In October it was 76.7%, above our 75% target for the first full month since we started tracking it shift by shift.
>
> Here's what actually moved, straight from our shift data:
>
> 📈 Performance: 82.8% → 89.7% (+6.8 pts)
> Every part now has a target cycle time in our system, so every shift is measured against the time the casting *should* take, not the time it happened to take.
>
> ✅ Quality: steady at 96.7% OK castings
>
> 📉 Availability: 92.0% → 88.5% (−3.5 pts)
> This is the honest part. Die loading/unloading took 1,725 minutes of downtime in October, more than double September's 780. More part changes means more die changes.
>
> So our next project is clear: faster die changeovers (SMED).
>
> Our best week in October hit 86.2% OEE. Now we want that to be a normal week, not a lucky one.
>
> You can't improve what you don't measure, and you can't measure honestly if you only share the good numbers.
>
> #DieCasting #HPDC #OEE #Manufacturing #LeanManufacturing #ContinuousImprovement #Aluminium #MakeInIndia

**Visual:** a screenshot of the DMS "OEE & Losses" report, or a simple 3-bar chart (A / P / Q, Sept vs Oct).

---

## Post 2: What we measure on every single shift

> Every shift, on both our 280T and 400T HPDC machines, our team records:
>
> 🔹 Shots and off-shots (warm-up/trial) per part
> 🔹 Rejections by defect type: non-fill, crack, soldering, blister…
> 🔹 Every minute of downtime, with a reason
> 🔹 Die coat consumption
> 🔹 Cycle time against target, for every part
>
> From that, the system calculates OEE, rejection PPM, metal consumed and melting loss automatically. No Excel, no end-of-month guesswork.
>
> In September and October that came to 232 shift records, which tell us:
> ▪️ 1,17,000+ good castings produced
> ▪️ ~28 tonnes of aluminium cast
> ▪️ 35,500+ parts fettled in October at 0.87% rejection, tracked person by person
>
> Customers don't buy castings. They buy confidence that the next 10,000 castings will be as good as the last 10,000.
> Data is how we earn that confidence.
>
> #DieCasting #AluminiumCasting #Manufacturing #DataDriven #Industry40 #QualityManagement

**Visual:** a photo of a supervisor entering a shift on a tablet or phone next to the machine.

---

## Post 3: I built our factory software with AI

> Not long ago, VR Alucast ran on paper registers and Excel sheets.
>
> Today, our whole plant runs on VRA DMS, software I built for our own shop floor, using AI as my coding partner.
>
> What it covers today:
> ⚙️ Production: shift reports, OEE, rejection, downtime
> 🧪 Quality: complaints, quality alerts, 5-Why CAPA, PFMEA, control plans
> 📏 Calibration of every gauge
> 📦 Raw material lots, suppliers, dispatch
> 👷 Skill matrix and training records
> 📄 Document control and work instructions with photos, translated into Marathi and Hindi for our operators
> 💼 Enquiries, feasibility and quotations
>
> Dozens of improvements shipped so far, almost all driven by what my team asked for on the shop floor.
>
> I'm not a software company. I'm a die caster. But AI has made it possible for an MSME owner to build exactly the system their factory needs, instead of bending the factory to fit an off-the-shelf ERP.
>
> If you run a small manufacturing unit and are curious how, my DMs are open.
>
> #AI #Entrepreneurship #MSME #Manufacturing #DieCasting #DigitalTransformation #BuildInPublic

**Visual:** a short screen recording (15–20 s) clicking through Production → Quality → Work Instructions.

---

## Post 4: Our metal is checked before it is melted

> Good castings start long before the die closes.
>
> Since April we have received 91 raw-material lots, about 81 tonnes of aluminium alloy (ADC12, A380, LM24, ALSI 9, LM6 and more).
> Every lot that needs it gets a spectro check before it reaches the furnace: 85 done, 6 marked "not required".
>
> And our suppliers are getting better with us:
> 📦 97 incoming supplier lots since July, over 27,000 received, 0 rejected
> ⏱️ On-time delivery (within 5 days): 59% in September → 93% in October
>
> We track every supplier the same way our customers track us. That's only fair, and it works.
>
> #SupplyChain #Aluminium #DieCasting #QualityControl #RawMaterial #SupplierDevelopment

**Visual:** a photo of an alloy ingot bundle with a lot-number tag, or the spectro report.

---

## Post 5: What happens when a customer finds a defect

> Every manufacturer gets complaints. What matters is what happens next.
>
> At VR Alucast, every complaint goes through the same path:
> 1️⃣ Logged in our system the same day
> 2️⃣ A Quality Alert with GOOD vs BAD photos goes to the shop floor
> 3️⃣ A 5-Why root-cause analysis (CAPA)
> 4️⃣ Closed only after we verify the fix actually worked
>
> Some of the root causes we found this year:
> 🔸 A gauge that wasn't right for the check, so we changed the gauge
> 🔸 Manual die spraying instead of auto spraying, so we changed the process
> 🔸 Boxes damaged in courier transit, so we changed the packaging
> 🔸 A work instruction and checklist that hadn't been updated, so we rebuilt how we write work instructions: step by step, with photos, in Marathi and Hindi
>
> 7 of our 10 CAPAs are closed, and 6 of those have verified effectiveness.
> The other 3 are open and being worked on right now.
>
> A complaint is a free consultant. We try to listen to every one.
>
> #QualityManagement #CAPA #RootCauseAnalysis #DieCasting #CustomerFirst #IATF16949

**Visual:** a real Quality Alert sheet (good/bad photos) with part details blurred.

---

## Post 6: We asked our customers to grade us

> Every quarter we send our customers a simple form: rate us out of 10.
>
> Q3 2026 results from our customers:
> ⭐ Communication: 9.3
> ⭐ Quality: 8.7
> ⭐ Overall: 8.7
> ⭐ Delivery: 8.0
> ⭐ Pricing: 7.3
>
> We're proud of communication, and we know where we need to work.
>
> On delivery: our supplier on-time rate jumped to 93% last month and our OEE crossed target, so delivery is next.
> On pricing: we won't win by cutting corners. We'll win by cutting waste. Every OEE point we gain is cost we don't have to pass on.
>
> Next quarter's form goes out in January. We'll share the results again, good or bad.
>
> #CustomerFeedback #Manufacturing #DieCasting #ContinuousImprovement #Transparency

**Visual:** a simple 5-bar chart of the scores.

---

## Post 7: The skill matrix behind every casting

> Machines make castings. People make quality.
>
> At VR Alucast, every team member has a skill matrix covering 39 skills, from machine operation and degassing to fettling, inspection, 5S and safety.
>
> In October alone, 240 skill assessments were updated, nearly 4× September's 63.
> Since 2025 we've run 13 trainings with 73 attendances: fire safety, nitrogen degassing, raw-material colour codes, 5S, even training on our own software.
>
> And our work instructions now come with step-by-step photos in Marathi and Hindi, because a good instruction is one the operator actually understands.
>
> When someone new joins, we don't hope they learn. We know exactly what they know.
>
> #SkillDevelopment #Manufacturing #PeopleFirst #Training #DieCasting #ShopFloor

**Visual:** a team photo at the machine, or a training session.

---

## Post 8: Engineering before production

> Before a new part ever reaches our HPDC machine:
>
> 📝 A documented feasibility study. We've done 65 so far for 66 enquiries.
> ⚠️ A PFMEA. 378 risk lines across our parts: what could fail, why, and how we stop it.
> 📋 A control plan. 346 characteristics, each with a gauge, frequency and reaction plan.
> 📏 Calibrated gauges. All 31 of our gauges are within calibration, 0 overdue, 40/40 calibrations passed.
> 📄 Controlled documents. 44 active, with 65 revisions tracked.
>
> None of this is glamorous. All of it is why the first casting and the ten-thousandth look the same.
>
> #APQP #PFMEA #ControlPlan #QualityEngineering #DieCasting #Automotive

**Visual:** a photo of the gauge board or a calibration certificate.

---

## Post 9: Monthly scorecard (October 2026 edition)

Post this format in the first week of every month, filled in from `linkedin_metrics.js`.

> 📊 VR Alucast — October 2026 scorecard
>
> OEE: 76.7% (target 75%) ▲ from 73.7%
> Performance: 89.7% ▲ +6.8 pts
> Quality: 96.7% (steady)
> Good castings: 57,700+
> Fettling rejection: 0.87%
> Supplier on-time: 93% ▲ from 59%
> Gauges in calibration: 31/31
> Skill assessments updated: 240
>
> Next month's focus: cutting die-change downtime.
>
> We publish our numbers every month. If you're looking for an aluminium die-casting partner who measures everything, let's talk.
>
> #DieCasting #Manufacturing #Scorecard #OEE #BuildInPublic

---

## Numbers I deliberately left out

- **Rejection PPM** (excluding off-shots) rose from about 7,600 to 15,200 in October. Total rejection % (incl. off-shots) stayed flat at ~3.3%, so fewer warm-up shots were scrapped but more castings were rejected. Fix this before celebrating it. Non-fill is the only defect recorded.
- **CAPA closure time**: October's CAPAs averaged 32 days vs 16 in September, so there's no "faster" story yet. CAPA-2026-009 closed in 11 days and could be an example once the trend improves.
- **Sales conversion**: of 66 enquiries, 5 are marked "PO Received". Not a number to publish yet.
- **Total good castings**: September (60,107, all shifts) was slightly higher than October (57,734), so don't claim output growth. The OEE gain came with fewer planned minutes.
- **November**: only 5 days of data, including a single 400T shift with 13% rejection.
