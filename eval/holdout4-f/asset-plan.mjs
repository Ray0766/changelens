// Case holdout4-f-en-asset-plan-long: a ~90-page ten-year asset management
// plan of a fictional water utility, printed by Chromium. Synthetic sample.
//
// Seven deliberate edits are scattered across the document. The paragraph
// inserted on page 3 pushes every later page down by a few lines.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n, d = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const neg = (n, d = 0) => (n < 0 ? `−${fmt(-n, d)}` : fmt(n, d));

const ORG = 'Harrowmere Water Authority';

const zones = [
  'Ardley Fen', 'Brackwater', 'Caddon Heath', 'Dunholt', 'Elmscar', 'Fernlow',
  'Gorsemere', 'Hatherby', 'Ivelstone', 'Kelmarsh Vale', 'Larkhollow', 'Marrowby',
  'Netherfold', 'Pellow Bay', 'Quarrendon', 'Rushmere Down', 'Stavely Cross', 'Tolland Edge',
  'Ulverby', 'Vexford', 'Wrayholme', 'Westcombe Rise', 'Yarrowfield', 'Yeldham Moss',
];
const sources = [
  'the Brackwater treatment works', 'the Elm Valley boreholes', 'the Netherfold impounding reservoir',
  'the Caddon river intake and treatment works', 'a bulk transfer from the Gorsemere trunk main',
  'the Stavely Cross springs and ultraviolet plant',
];
const streets = [
  'Mill Lane', 'Kiln Street', 'Station Road', 'Orchard Way', 'Tanners Row', 'High Causeway', 'Chapel Hill',
  'Ropewalk', 'Long Furlong', 'Quarry Lane', 'Market Place', 'Bridge End', 'Hollow Way', 'School Lane',
  'Ferry Road', 'Beacon Rise', 'Weavers Close', 'Sandpit Lane', 'Gallows Hill', 'Copse Road',
];
const towns = ['the market town', 'two small towns', 'a commuter town', 'a coastal resort', 'a former mill town', 'an expanding new settlement'];
const conditionLead = [
  'Mains condition is generally fair, but the cast-iron mains laid between 1890 and 1935 account for most bursts.',
  'Most of the network was laid after 1960 in ductile iron and PVC, and its condition is good for its age.',
  'The asbestos-cement mains installed in the 1950s and 1960s are now the main source of failures.',
  'Condition is mixed: the town centre has old cast-iron mains, while the outer estates have modern polyethylene pipes.',
  'Ground movement in the clay soils causes a seasonal peak in bursts in late summer.',
  'The zone has a high share of small-diameter galvanised steel mains, which corrode from the inside.',
];
const riskLead = [
  'The main risk is the single feed from the source works; an outage of more than eighteen hours would exhaust storage.',
  'The service reservoirs are close to the end of their structural life and two have known roof defects.',
  'Rising peak summer demand from new housing is reducing the margin between demand and pumping capacity.',
  'Several trunk main crossings under the railway cannot be inspected without possessions.',
  'Low pressure at the top of the zone is caused by an undersized main rather than by the pumps.',
  'Telemetry coverage is incomplete, so some reservoir levels are read only during site visits.',
];
const dependencyLead = [
  'Works in this zone are coordinated with the highway authority’s resurfacing programme to avoid digging up new road surfaces.',
  'The interventions depend on the power supply upgrade that the distribution network operator has scheduled.',
  'Planning consent is needed for the new reservoir; pre-application discussions have started.',
  'The mains renewal will share traffic management with the gas network operator where routes overlap.',
  'The programme assumes that the land purchase for the new pumping station completes in the first year.',
  'Customer contact will be handled by the regional engagement team, with letters sent four weeks before work starts.',
];
const hydraulicsLead = [
  (z, r) => `Pressures range from ${Math.round(18 + r() * 10)} m at the top of ${z.street2} to ${Math.round(55 + r() * 30)} m in the lower part of the zone, so the pressure-reducing valves are set to keep night pressures below 45 m.`,
  (z, r) => `The hydraulic model was recalibrated in ${2023 + Math.floor(r() * 3)} using ${Math.round(20 + r() * 60)} pressure loggers; it shows that the trunk main along ${z.street1} runs close to its capacity on peak days.`,
  (z, r) => `Night flows have fallen by ${Math.round(5 + r() * 25)} per cent since the district meters were renewed, but the zone still has three areas with pressures above 70 m.`,
  (z, r) => `The critical point for pressure is at ${z.street2}, where the service level of 20 m is met only when both booster pumps are available.`,
  (z, r) => `Most of the zone is fed by gravity from the service reservoirs; only ${Math.round(3 + r() * 20)} per cent of properties depend on a booster pumping station.`,
];
const optionsLead = [
  'For the reservoir defects, the options were refurbishment, replacement on the same site and a new tank on a higher site; refurbishment had the lowest whole-life cost.',
  'For the mains, targeted replacement of the worst lengths was compared with blanket renewal of all cast-iron mains; targeted replacement gives most of the benefit at about a third of the cost.',
  'A second feed into the zone was considered, but its cost was not justified by the reduction in risk; additional storage was chosen instead.',
  'The option of doing nothing was costed in each case and used as the baseline for the benefit assessment.',
  'Pressure management was preferred to additional mains renewal because it reduces bursts across the whole zone, not only on the renewed lengths.',
  'Lining rather than replacing the mains was rejected because of the number of service connections, which would each need to be re-made.',
];
const customerLead = [
  'Customer contacts about discoloured water are above the regional average and are concentrated in the older streets.',
  'The zone has a higher than average number of customers on the priority services register, who will be contacted individually before planned interruptions.',
  'Complaints about low pressure have fallen since the booster pumps were replaced, but remain high in the upper part of the zone.',
  'Taste and odour contacts rise every autumn when the source water changes, and are handled by a seasonal treatment adjustment.',
  'Customers in the zone said in the consultation that they would accept longer roadworks if the number of interruptions fell.',
];
const wqParams = ['Turbidity', 'Free chlorine residual', 'Iron', 'Manganese', 'Lead', 'Coliform bacteria'];
const interventionKinds = [
  (r, z) => { const km = 1 + r() * 6; return [`Replace ${fmt(km, 1)} km of trunk main along ${z.street1}`, km * (900 + r() * 600)]; },
  (r, z) => [`Refurbish ${z.name} No. ${1 + Math.floor(r() * 3)} service reservoir (roof membrane and internal coating)`, 600 + r() * 2400],
  (r, z) => { const n = 2 + Math.floor(r() * 7); return [`Pressure management in ${n} district metered areas`, n * (120 + r() * 200)]; },
  (r, z) => { const n = 4 + Math.floor(r() * 20); return [`Upgrade ${n} telemetry outstations to cellular communications`, n * (12 + r() * 10)]; },
  (r, z) => [`Renew booster pumps and controls at ${z.street2} pumping station`, 350 + r() * 1200],
  (r, z) => { const km = 2 + r() * 12; return [`Rehabilitate ${fmt(km, 1)} km of cast-iron distribution mains`, km * (450 + r() * 300)]; },
  (r, z) => { const n = 50 + Math.floor(r() * 300); return [`Replace ${n} lead communication pipes in the ${z.street1} area`, n * (2.2 + r() * 1.2)]; },
  (r, z) => { const ml = 1 + r() * 4; return [`New ${fmt(ml, 1)} Ml storage tank at ${z.street2}`, ml * (1300 + r() * 600)]; },
  (r, z) => { const n = 10 + Math.floor(r() * 40); return [`Install ${n} acoustic leak loggers on strategic mains`, n * (2 + r() * 2)]; },
];

function zoneData(i) {
  const r = mulberry32(1000 + i * 37);
  const z = { name: zones[i], index: i };
  z.population = Math.round((8000 + r() * 87000) / 100) * 100;
  z.properties = Math.round(z.population / (2.2 + r() * 0.3) / 10) * 10;
  z.town = towns[Math.floor(r() * towns.length)];
  z.source = sources[Math.floor(r() * sources.length)];
  z.reservoirs = 1 + Math.floor(r() * 6);
  z.storage = 2 + r() * 40;
  z.street1 = streets[Math.floor(r() * streets.length)];
  z.street2 = streets[(streets.indexOf(z.street1) + 3 + Math.floor(r() * 10)) % streets.length];
  z.assets = [
    ['Trunk mains', 5 + r() * 140, 'km', 1],
    ['Distribution mains', 40 + r() * 600, 'km', 1],
    ['Service reservoirs', z.reservoirs, 'no.', 0],
    ['Pumping stations', 1 + Math.floor(r() * 9), 'no.', 0],
    ['Pressure-reducing valves', 3 + Math.floor(r() * 60), 'no.', 0],
    ['Hydrants', 100 + Math.floor(r() * 2400), 'no.', 0],
    ['Customer meters', Math.round(z.properties * (0.55 + r() * 0.4)), 'no.', 0],
    ['Telemetry outstations', 6 + Math.floor(r() * 60), 'no.', 0],
  ].map(([cls, qty, unit, d]) => ({ cls, qty, unit, d, age: 8 + Math.floor(r() * 80), grade: 1 + Math.floor(r() * 5) }));
  z.bursts = 8 + r() * 24;
  z.leakage = 0.4 + r() * 9;
  z.interruptions = 4 + r() * 40;
  z.condition = conditionLead[Math.floor(r() * conditionLead.length)];
  z.risk = riskLead[Math.floor(r() * riskLead.length)];
  z.dependency = dependencyLead[Math.floor(r() * dependencyLead.length)];
  z.hydraulics = hydraulicsLead[Math.floor(r() * hydraulicsLead.length)](z, r);
  z.options = optionsLead[Math.floor(r() * optionsLead.length)];
  z.customer = customerLead[Math.floor(r() * customerLead.length)];
  const prefix = z.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  z.dmas = Array.from({ length: 6 + Math.floor(r() * 8) }, (_, j) => ({
    code: `${prefix}-${String(j + 1).padStart(2, '0')}`,
    props: Math.round((300 + r() * 3200) / 10) * 10,
    night: 1 + r() * 14,
    leak: 40 + r() * 160,
    pressure: 28 + r() * 40,
  }));
  z.growth = { homes: Math.round((50 + r() * 2400) / 10) * 10, peak: 2 + r() * 14, year: 2028 + Math.floor(r() * 6) };
  z.years = Array.from({ length: 10 }, (_, j) => ({ y: 2027 + j, km: r() * 6, lead: Math.floor(r() * 220), meters: Math.floor(r() * 900) }));
  z.wq = wqParams.map((p) => ({ p, samples: 12 + Math.floor(r() * 400), fails: r() < 0.7 ? 0 : 1 + Math.floor(r() * 3) }));
  const kinds = [...interventionKinds.keys()].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3));
  z.interventions = kinds.map((k, j) => {
    const [text, cost] = interventionKinds[k](r, z);
    return {
      ref: `AMP-${String(i + 1).padStart(2, '0')}-${String(j + 1).padStart(2, '0')}`,
      text,
      start: 2027 + Math.floor(r() * 9),
      cost: Math.round(cost / 10) * 10,
    };
  });
  return z;
}

// Zone-specific sentences that carry deliberate edits.
const E2_ZONE = 4; // Elmscar: trunk mains length changes
const E3_ZONE = 8; // Ivelstone: a sentence is deleted
const E4_ZONE = 13; // Pellow Bay: "quarterly" -> "monthly"

function zoneHtml(z, v) {
  const n = z.index + 1;
  if (z.index === E2_ZONE) z.assets[0].qty = v === 'before' ? 148.6 : 152.9;
  const extraCondition = {
    [E3_ZONE]: ' A further 2.3 km of cast-iron main beneath Harbour Street will be relined during the quay works, under a joint traffic management plan with the highway authority.',
    5: ' The 1912 brick culvert carrying the overflow from the upper reservoir was surveyed by remote camera and found sound.',
    11: ' Burst frequency doubled during the dry summer of 2025, when soil shrinkage was at its worst.',
  };
  const extraRisk = {
    [E4_ZONE]: ` The raw water intake screens at Pellow Bay are inspected ${v === 'before' ? 'quarterly' : 'monthly'} and after every storm warning issued for the estuary.`,
    2: ' The access track to the Caddon Heath reservoir floods in winter, which delays emergency repairs.',
    16: ' An agreement with the neighbouring utility allows an emergency cross-connection at Stavely Cross for up to 72 hours.',
  };
  const condition = z.index === E3_ZONE && v === 'after' ? '' : (extraCondition[z.index] ?? '');
  const rows = z.assets.map((a) => `<tr><td>${a.cls}</td><td class="num">${fmt(a.qty, a.d)}</td><td>${a.unit}</td><td class="num">${a.age}</td><td class="num">${a.grade}</td></tr>`).join('');
  const ints = z.interventions.map((t) => `<tr><td class="ref">${t.ref}</td><td>${t.text}</td><td class="num">${t.start}</td><td class="num">${fmt(t.cost)}</td></tr>`).join('');
  const total = z.interventions.reduce((s, t) => s + t.cost, 0);
  return `
<h2>5.${n} ${z.name} supply zone</h2>
<p>The ${z.name} zone serves approximately ${fmt(z.population)} people in ${fmt(z.properties)} properties, centred on ${z.town} of ${z.name} and the surrounding parishes. It is supplied from ${z.source} and has ${z.reservoirs} service reservoir${z.reservoirs > 1 ? 's' : ''} with a combined storage of ${fmt(z.storage, 1)} megalitres, equivalent to about ${fmt(z.storage * 1000 / (z.population * 0.14) , 0)} hours of average demand.</p>
<h3>Asset register summary</h3>
<table><thead><tr><th>Asset class</th><th>Quantity</th><th>Unit</th><th>Median age (years)</th><th>Condition grade (1–5)</th></tr></thead><tbody>${rows}</tbody></table>
<h3>District metered areas</h3>
<table><thead><tr><th>DMA</th><th>Properties</th><th>Minimum night flow (l/s)</th><th>Leakage (l/property/day)</th><th>Average pressure (m)</th></tr></thead><tbody>${z.dmas.map((d) => `<tr><td>${d.code}</td><td class="num">${fmt(d.props)}</td><td class="num">${fmt(d.night, 1)}</td><td class="num">${fmt(d.leak, 0)}</td><td class="num">${fmt(d.pressure, 1)}</td></tr>`).join('')}</tbody></table>
<p>${z.hydraulics}</p>
<h3>Condition and performance</h3>
<p>${z.condition} Over the last three years the zone averaged ${fmt(z.bursts, 1)} bursts per 100 km of main per year, against an Authority-wide average of 14.2. Leakage is estimated at ${fmt(z.leakage, 2)} megalitres per day, and the average customer lost ${fmt(z.interruptions, 1)} minutes of supply per year to unplanned interruptions.${condition}</p>
<h3>Water quality and customers</h3>
<table><thead><tr><th>Parameter (2025)</th><th>Samples</th><th>Samples above standard</th></tr></thead><tbody>${z.wq.map((w) => `<tr><td>${w.p}</td><td class="num">${w.samples}</td><td class="num">${w.fails}</td></tr>`).join('')}</tbody></table>
<p>${z.customer} Each sample above the standard was investigated, and the cause and the action taken were reported to the drinking water inspectorate.</p>
<h3>Risks</h3>
<p>${z.risk}${extraRisk[z.index] ?? ''} The risk scores for this zone are carried in the corporate risk register and reviewed by the asset strategy group twice a year.</p>
<h3>Growth and new connections</h3>
<p>The local plan allocates about ${fmt(z.growth.homes)} new homes in the zone up to 2036. On current assumptions they will add ${fmt(z.growth.peak, 1)} per cent to peak demand, and the existing network can absorb this growth until about ${z.growth.year}, after which the reinforcement listed below is needed. Developers pay for the new mains on their sites and contribute to network reinforcement through infrastructure charges.</p>
<table><thead><tr><th>Year</th><th>Mains renewed (km)</th><th>Lead pipes replaced</th><th>Meters installed</th></tr></thead><tbody>${z.years.map((y) => `<tr><td>${y.y}/${String(y.y + 1).slice(2)}</td><td class="num">${fmt(y.km, 1)}</td><td class="num">${y.lead}</td><td class="num">${y.meters}</td></tr>`).join('')}</tbody></table>
<h3>Planned interventions 2027–2036</h3>
<table><thead><tr><th>Ref.</th><th>Intervention</th><th>Start</th><th>Cost (£k)</th></tr></thead><tbody>${ints}<tr class="total"><td></td><td>Total for ${z.name}</td><td></td><td class="num">${fmt(total)}</td></tr></tbody></table>
<p>${z.options}</p>
<p>${z.dependency} Costs are at 2026/27 prices and include design, construction, land and a risk allowance of 15 per cent.</p>`;
}

const works = [
  { name: 'Brackwater', kind: 'river abstraction and conventional treatment', cap: 74, built: 1958, stages: ['Intake and screens', 'Raw water pumping', 'Coagulation and flocculation', 'Clarifiers', 'Rapid gravity filters', 'Granular activated carbon', 'Chlorine contact tank', 'Treated water pumping'] },
  { name: 'Caddon', kind: 'river abstraction and membrane filtration', cap: 41, built: 2004, stages: ['Intake and screens', 'Raw water storage lagoon', 'Ultrafiltration membranes', 'Ultraviolet disinfection', 'Chlorine dosing', 'Treated water pumping'] },
  { name: 'Elm Valley', kind: 'groundwater from eleven boreholes', cap: 38, built: 1936, stages: ['Borehole pumps', 'Aeration tower', 'Pressure filters', 'Chlorine dosing', 'Contact main', 'Treated water pumping'] },
  { name: 'Netherfold', kind: 'impounding reservoir and conventional treatment', cap: 52, built: 1971, stages: ['Draw-off tower', 'Microstrainers', 'Dissolved air flotation', 'Rapid gravity filters', 'Manganese contactors', 'Chlorine contact tank', 'Clear water tank'] },
  { name: 'Stavely Cross', kind: 'spring sources with ultraviolet treatment', cap: 9, built: 1989, stages: ['Spring collection chambers', 'Cartridge filters', 'Ultraviolet reactors', 'Chlorine dosing', 'Treated water storage'] },
  { name: 'Gorsemere', kind: 'lake abstraction and slow sand filtration', cap: 27, built: 1902, stages: ['Lake intake', 'Roughing filters', 'Slow sand filters', 'Chlorine contact tank', 'Treated water pumping'] },
  { name: 'Larkhollow', kind: 'groundwater from four boreholes with nitrate removal', cap: 14, built: 1998, stages: ['Borehole pumps', 'Ion exchange nitrate removal', 'Blending tank', 'Chlorine dosing', 'Treated water pumping'] },
  { name: 'Marrowby', kind: 'river abstraction and conventional treatment', cap: 21, built: 1966, stages: ['Intake and screens', 'Coagulation and flocculation', 'Clarifiers', 'Rapid gravity filters', 'Chlorine contact tank', 'Sludge treatment'] },
  { name: 'Tolland Edge', kind: 'groundwater from two boreholes', cap: 10, built: 1979, stages: ['Borehole pumps', 'Pressure filters', 'Chlorine dosing', 'Treated water storage'] },
];
const worksPlanned = [
  'Like-for-like replacement of mechanical and electrical equipment',
  'Structural repairs and new access walkways',
  'Replacement of the control system and instrumentation',
  'No major work; routine maintenance only',
  'Capacity uprating and new standby unit',
  'Refurbishment of media and underdrains',
  'Replacement of dosing pumps and chemical storage',
];
const worksRisk = [
  'The site has a single power supply, and the standby generator can run only the treated water pumps.',
  'Raw water quality deteriorates after heavy rain, and the works must reduce output when turbidity is high.',
  'Several process stages have no standby unit, so planned maintenance has to be carried out at night in winter.',
  'The site lies partly in the flood plain, and the lower pumping hall was flooded in 2020.',
  'Chemical deliveries use a narrow lane that is closed in snow, so the site holds fourteen days of stock.',
];
function worksHtml(w, i) {
  const r = mulberry32(500 + i * 11);
  const rows = w.stages.map((st) => `<tr><td>${st}</td><td class="num">${1 + Math.floor(r() * 5)}</td><td class="num">${w.built + Math.floor(r() * 60)}</td><td>${worksPlanned[Math.floor(r() * worksPlanned.length)]}</td></tr>`).join('');
  return `
<h2>4.${i + 1} ${w.name} works</h2>
<p>${w.name} is a site for ${w.kind}, built in ${w.built}, with a maximum output of ${w.cap} megalitres per day. In 2025/26 it supplied an average of ${fmt(w.cap * (0.55 + r() * 0.3), 1)} megalitres per day and was out of service for ${Math.round(r() * 90)} hours, mostly for planned maintenance.</p>
<table><thead><tr><th>Process stage</th><th>Condition grade</th><th>Last major renewal</th><th>Planned 2027–2036</th></tr></thead><tbody>${rows}</tbody></table>
<p>${worksRisk[Math.floor(r() * worksRisk.length)]} Energy use at the site was ${fmt(180 + r() * 420, 0)} kWh per megalitre treated, and the plan includes a review of pump efficiency at the next major renewal.</p>`;
}

const suffixes = ['', ' (north)', ' (south)', ' (east)', ' (west)', ' to ' , ' crossing'];
const materials = ['CI', 'CI', 'CI', 'AC', 'AC', 'GS', 'DI', 'PVC'];
const methods = ['Open cut', 'Slip-lining', 'Pipe bursting', 'Directional drilling', 'Open cut'];
const E8_ROW = 517; // index in the mains schedule whose length is corrected
function mainsSchedule(before) {
  const r = mulberry32(4242);
  const rows = [];
  for (let k = 0; k < 600; k++) {
    const zi = Math.floor(r() * zones.length);
    const st = streets[Math.floor(r() * streets.length)];
    let suf = suffixes[Math.floor(r() * suffixes.length)];
    if (suf === ' to ') suf = ` to ${streets[Math.floor(r() * streets.length)]}`;
    rows.push({
      ref: `MR-${String(k + 1).padStart(4, '0')}`,
      zone: zones[zi],
      loc: st + suf,
      mat: materials[Math.floor(r() * materials.length)],
      dia: [75, 90, 100, 125, 150, 180, 225, 250, 300, 355, 450][Math.floor(r() * 11)],
      len: Math.round((60 + r() * 2300) / 10) * 10,
      year: 2027 + Math.floor(r() * 5),
      method: methods[Math.floor(r() * methods.length)],
    });
  }
  rows.sort((a, b) => a.year - b.year || zones.indexOf(a.zone) - zones.indexOf(b.zone));
  rows.forEach((m, k) => { m.ref = `MR-${String(k + 1).padStart(4, '0')}`; });
  rows[E8_ROW].len = before ? 1180 : 1810;
  return rows;
}
const resActions = ['Roof membrane renewal', 'Internal coating and joint sealing', 'Replace with new tank on same site', 'Hatch and vent security upgrade', 'No action in this plan', 'Structural survey in 2028', 'Decommission after new storage is built'];
function reservoirSchedule() {
  const r = mulberry32(6161);
  return Array.from({ length: 61 }, (_, k) => {
    const zi = k % zones.length;
    return { name: `${zones[zi]} No. ${1 + Math.floor(k / zones.length)}`, zone: zones[zi], cap: 0.5 + r() * 18, built: 1880 + Math.floor(r() * 140), grade: 1 + Math.floor(r() * 5), action: resActions[Math.floor(r() * resActions.length)] };
  }).sort((a, b) => zones.indexOf(a.zone) - zones.indexOf(b.zone) || a.name.localeCompare(b.name));
}

const glossary = [
  ['Asset class', 'A group of assets of the same kind that are planned and reported together, such as trunk mains or service reservoirs.'],
  ['Burst', 'A failure of a water main that causes a visible leak or loss of supply and needs a repair.'],
  ['Capital maintenance', 'Expenditure that restores or replaces existing assets so that they keep delivering the same service.'],
  ['Communication pipe', 'The section of service pipe between the water main and the boundary of the customer’s property.'],
  ['Condition grade', 'A score from 1 (very good) to 5 (very poor) that describes the physical state of an asset.'],
  ['Critical asset', 'An asset whose failure would interrupt supply to more than 5,000 properties or cause a serious safety risk.'],
  ['District metered area (DMA)', 'A section of network with metered inflows and outflows, used to measure leakage.'],
  ['Enhancement', 'Expenditure that improves service or adds capacity beyond what the existing assets provide.'],
  ['Headroom', 'The margin between available supply and forecast demand, including an allowance for uncertainty.'],
  ['Interruption', 'A period during which a property receives no water, or water at a pressure too low to use.'],
  ['Lead communication pipe', 'A communication pipe made of lead, which can raise lead levels at the customer’s tap.'],
  ['Megalitre (Ml)', 'One million litres.'],
  ['Non-revenue water', 'Water put into supply that is not billed, mainly leakage and unbilled authorised use.'],
  ['Outstation', 'A telemetry unit on site that reports levels, flows, alarms and pump states to the control room.'],
  ['Pressure management', 'Reducing pressure at times of low demand to cut leakage and the number of bursts.'],
  ['Resilience', 'The ability to keep supplying customers during and after shocks such as floods, power cuts or droughts.'],
  ['Risk allowance', 'An amount added to cost estimates to cover risks that are known but cannot yet be priced.'],
  ['Service reservoir', 'A covered tank that stores treated water close to customers and balances daily demand.'],
  ['Trunk main', 'A large-diameter main that carries treated water from works to service reservoirs or between zones.'],
  ['Whole-life cost', 'The total cost of owning an asset over its life, including construction, operation, maintenance and disposal.'],
];

export function html(v) {
  const before = v === 'before';
  const z = zones.map((_, i) => zoneData(i));
  const capex = [];
  const r = mulberry32(77);
  for (let y = 2027; y <= 2036; y++) {
    const row = [Math.round(4200 + r() * 3000), Math.round(2600 + r() * 2400), Math.round(900 + r() * 1800), Math.round(600 + r() * 900), Math.round(300 + r() * 700)];
    capex.push({ y, row, total: row.reduce((a, b) => a + b, 0) });
  }
  const capexRows = capex.map((c) => `<tr><td>${c.y}/${String(c.y + 1).slice(2)}</td>${c.row.map((x) => `<td class="num">${fmt(x * 10)}</td>`).join('')}<td class="num">${fmt(c.total * 10)}</td></tr>`).join('');

  // Budget variance table (chapter 6). E5: the variance on "Energy" had lost its minus sign.
  const variance = [
    ['Employee costs', 18420, 18105],
    ['Energy', 4820, 6070],
    ['Chemicals', 2140, 2385],
    ['Materials and spares', 3310, 3195],
    ['Contractors and hired services', 7650, 7920],
    ['Business rates', 2905, 2905],
    ['Insurance', 1210, 1340],
    ['IT and telemetry licences', 1480, 1395],
    ['Vehicles and plant', 1960, 2010],
    ['Abstraction and discharge charges', 980, 1015],
  ];
  const varRows = variance.map(([k, b, o]) => {
    let vtxt = neg(b - o);
    if (k === 'Energy' && before) vtxt = fmt(o - b); // the sign was missing in the old version
    return `<tr><td>${k}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(o)}</td><td class="num">${vtxt}</td></tr>`;
  }).join('');

  const risks = [
    ['R-01', 'Prolonged outage at the Brackwater treatment works', '4', '5', 'Second treatment stream; mobile treatment unit contract'],
    ['R-02', 'Drought reduces yield of the Elm Valley boreholes', '3', '4', 'Drought plan triggers; demand restrictions; bulk transfer'],
    ['R-03', 'Failure of a critical trunk main crossing the railway', '2', '5', 'Inspection under possession; valve exercising; spare pipe stock'],
    ['R-04', 'Cyber attack on the telemetry and control system', '3', '5', 'Network segregation; incident exercises; offline backups'],
    ['R-05', 'Contractor capacity shortfall in peak years', '4', '3', 'Framework with three contractors; programme smoothing'],
    ['R-06', 'Construction cost inflation above forecast', '4', '3', 'Risk allowance; quarterly re-forecasting; value engineering'],
    ['R-07', 'Flooding of low-lying pumping stations', '3', '4', 'Flood walls at four sites; kiosk relocation; portable pumps'],
    ['R-08', 'Loss of power at strategic sites', '3', '4', 'Standby generators; fuel contracts; load shedding plan'],
    ['R-09', 'Water quality failure from reservoir ingress', '2', '5', 'Roof inspections; hatch security; sampling regime'],
    ['R-10', 'Unplanned growth from housing allocations', '3', '3', 'Liaison with planning authorities; staged reinforcement'],
    ['R-11', 'Loss of key operational staff', '3', '3', 'Succession plans; apprenticeships; knowledge capture'],
    ['R-12', 'Delay in planning consent for new storage', '3', '3', 'Early engagement; alternative sites identified'],
    ['R-13', 'Third-party damage to mains during street works', '4', '2', 'Records sharing; site supervision; recovery of costs'],
    ['R-14', 'Failure of legacy billing interface for meter data', '2', '3', 'Interface replacement in 2028; manual fallback'],
    ['R-15', 'Pollution incident at an abstraction point', '2', '4', 'Catchment monitoring; intake shut-off; alternative sources'],
  ];
  if (!before) {
    risks.push(['R-16', 'Single approved supplier of sodium hypochlorite for disinfection', '2', '5', 'Second supplier qualified by 2028; 21 days of on-site stock']);
  }
  const riskRows = risks.map((x) => `<tr>${x.map((c, j) => `<td${j === 2 || j === 3 ? ' class="num"' : j === 0 ? ' class="ref"' : ''}>${c}</td>`).join('')}</tr>`).join('');

  const kpis = [
    ['Leakage (Ml/d, three-year average)', '38.4', '33.0', '28.5'],
    ['Bursts per 1,000 km of main', '142', '130', '118'],
    ['Average minutes lost per property per year', '11.6', '8.0', '5.0'],
    ['Properties with low pressure (no.)', '412', '250', '120'],
    ['Lead communication pipes replaced (cumulative)', '1,860', '6,500', '14,000'],
    ['Service reservoirs at condition grade 4 or 5 (no.)', '17', '9', '3'],
    ['Customer contacts about water quality per 1,000 population', '1.42', '1.20', '1.00'],
    ['Telemetry outstations on cellular communications (%)', '36', '75', '100'],
  ];
  const kpiRows = kpis.map((k) => `<tr><td>${k[0]}</td><td class="num">${k[1]}</td><td class="num">${k[2]}</td><td class="num">${k[3]}</td></tr>`).join('');
  const glossaryRows = glossary.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Asset Management Plan 2027–2036</title>
<style>
  @page { size: A4; }
  body { font-family: 'Liberation Serif', serif; font-size: 10.5pt; line-height: 1.38; color: #111; margin: 0; }
  h1, h2, h3, th, .cover, dt { font-family: 'Liberation Sans', sans-serif; }
  h1 { font-size: 17pt; margin: 22pt 0 8pt; color: #0b3b5c; break-after: avoid; }
  h2 { font-size: 12.5pt; margin: 16pt 0 5pt; color: #0b3b5c; break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; break-after: avoid; }
  p { margin: 0 0 6pt; text-align: left; orphans: 2; widows: 2; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; font-size: 9.5pt; }
  th { background: #dce7ef; text-align: left; font-size: 8.5pt; padding: 3pt 5pt; border-bottom: 1px solid #6d8ba0; }
  td { padding: 2.5pt 5pt; border-bottom: 0.5px solid #c4cfd8; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  td.ref { white-space: nowrap; }
  tr { break-inside: avoid; }
  tr.total td { font-weight: bold; border-top: 1px solid #6d8ba0; }
  .cover { break-after: page; padding-top: 50mm; }
  .cover .org { font-size: 13pt; color: #0b3b5c; letter-spacing: 0.04em; }
  .cover .title { font-size: 28pt; font-weight: bold; margin: 10pt 0; color: #0b3b5c; }
  .cover .sub { font-size: 14pt; }
  .cover .meta { margin-top: 40mm; font-size: 10.5pt; }
  .synthetic { margin-top: 10mm; padding: 6pt 8pt; border: 1px solid #b06a00; color: #6b4100; font-size: 9.5pt; width: 120mm; }
  dl { margin: 0; } dt { font-weight: bold; font-size: 10pt; margin-top: 5pt; } dd { margin: 0 0 0 14pt; }
  .signoff td { padding: 8pt 5pt; }
</style></head><body>
<div class="cover">
  <div class="org">${ORG.toUpperCase()}</div>
  <div class="title">Asset Management Plan 2027–2036</div>
  <div class="sub">Ten-year plan for treatment, network and storage assets</div>
  <div class="meta">Version 3.1 · Submitted to the Board for approval<br>Prepared by the Asset Strategy Group</div>
  <div class="synthetic">Synthetic sample. ${ORG} is a fictional organisation. All places, names and figures in this document are invented for software testing.</div>
</div>

<h1>1 Introduction</h1>
<h2>1.1 Purpose of this plan</h2>
<p>This plan sets out how the Authority will look after the treatment works, pipes, pumping stations and service reservoirs that supply drinking water to around 640,000 people over the ten years from April 2027. It explains what condition the assets are in, which risks they pose to customers, and which interventions are proposed to manage those risks at the lowest whole-life cost.</p>
<p>The plan is the main input to the Authority’s business plan for the next two regulatory periods. It is also the reference for the annual investment programme, which turns the interventions described here into individual projects with their own budgets, approvals and delivery dates.</p>
<p>The Board is asked to approve the plan as the basis for that business plan. Approval does not commit expenditure on any individual project; each project still needs approval at the gate set out in the Authority’s investment governance framework.</p>
<h2>1.2 Scope</h2>
<p>The plan covers all assets used to abstract, treat, store and distribute drinking water, from the raw water intakes to the boundary of each customer’s property. It includes the communication pipes that the Authority owns, but not the supply pipes inside private land, which remain the responsibility of property owners.</p>
<p>Non-infrastructure assets that support operations, such as depots, vehicles, laboratories and office buildings, are covered by the separate corporate property plan. Information technology systems are covered only where they monitor or control operational assets, in particular telemetry, the control room and the hydraulic models.</p>
<p>The plan does not cover wastewater, which in this region is the responsibility of a separate body. Where water and wastewater works share a site or a route, the plan notes the dependency in the relevant zone profile.</p>
<h2>1.3 How the plan was prepared</h2>
<p>The plan was prepared by the Asset Strategy Group over eighteen months. It draws on the asset register, condition surveys of all 61 service reservoirs, burst and interruption records for the last ten years, the leakage model, and workshops with operations staff in each of the four service areas.</p>
<p>Each zone was assessed on the same basis: the likelihood that an asset fails within the planning period, the consequence of that failure for customers and the environment, and the cost of the available options to reduce the risk. Options were compared on whole-life cost over forty years, using the discount rate set by the regulator.</p>
<p>A draft of the plan was published for consultation between May and July 2026. The Authority received 214 responses from customers, parish councils, developers and other utilities. The main themes were the pace of lead pipe replacement, the disruption caused by street works and the resilience of supplies to rural villages.</p>
${before ? '' : `<p>In response to consultation feedback, this version also sets out how the Authority will report progress against the plan to customers each year, through a published scorecard and an open meeting held in each of the four service areas. The table summarises the main themes raised and where the plan responds to them.</p>
<table><thead><tr><th>Theme raised in consultation</th><th>Responses</th><th>Where the plan responds</th></tr></thead><tbody>
<tr><td>Pace of lead pipe replacement</td><td class="num">61</td><td>Lead replacement rows in each zone profile; indicator in chapter 9</td></tr>
<tr><td>Disruption from street works</td><td class="num">48</td><td>Coordination with highway and gas works in the zone profiles</td></tr>
<tr><td>Resilience of rural supplies</td><td class="num">39</td><td>Storage and second feeds for villages; standby generation</td></tr>
<tr><td>Bills and affordability</td><td class="num">33</td><td>Phasing of the largest schemes; social tariff (section 2.4)</td></tr>
<tr><td>Reporting and transparency</td><td class="num">19</td><td>Annual scorecard and open meetings (this section)</td></tr>
</tbody></table>`}
<p>The figures in this version reflect the asset register as at 31 March 2026 and prices at 2026/27 levels. Where later information was available, for example from surveys completed in the autumn of 2026, it is mentioned in the text but has not been used to change the costed programme.</p>
<h2>1.4 Structure of the document</h2>
<p>Chapter 2 describes the strategic context: demand, regulation, climate and affordability. Chapter 3 summarises the asset base. Chapter 4 describes the nine treatment works, and Chapter 5 contains a profile of each of the twenty-four supply zones, with its assets, condition, risks and planned interventions. Chapters 6 and 7 bring the interventions together into a capital programme and a financial plan. Chapter 8 describes the main risks to delivering the plan and how they are managed, and Chapter 9 explains how progress will be monitored. The appendices contain a glossary and the record of approval.</p>

<h1>2 Strategic context</h1>
<h2>2.1 Demand outlook</h2>
<p>Average demand across the region was 198 megalitres per day in 2025/26, of which about 62 per cent was household use. The population served is forecast to grow by 9 per cent over the planning period, mostly in the new settlements allocated in the local plans for the Fernlow and Quarrendon areas.</p>
<p>Household consumption per person has fallen slowly since meters became compulsory for new connections, and is now about 139 litres per person per day. The plan assumes that it falls further to 125 litres by 2036, supported by the metering programme, water efficiency visits and tariffs that reward lower use.</p>
<p>Peak demand during hot weather remains the main pressure on the network. On the hottest days of the 2025 summer, demand rose to 262 megalitres per day, and several reservoirs in the eastern zones fell below a quarter of their capacity overnight. The plan therefore gives priority to storage and transfer capacity in those zones.</p>
<p>Non-household demand is dominated by food processing and by two hospitals. The Authority has agreements with the largest users to reduce consumption during droughts, and the plan assumes that these agreements remain in place.</p>
<h2>2.2 Regulatory obligations</h2>
<p>The Authority must supply water that meets the drinking water quality regulations, maintain adequate pressure, and meet the performance commitments agreed with the economic regulator for leakage, interruptions, bursts and customer contacts. Failing a commitment leads to financial penalties and, in serious cases, enforcement action.</p>
<p>The drinking water inspectorate requires the Authority to complete the programme of lead communication pipe replacement agreed in its lead strategy, and to maintain service reservoirs so that they do not allow contamination. Two undertakings agreed with the inspectorate in 2024 are included in the programme: the refurbishment of the Gorsemere reservoirs and the replacement of the ultraviolet plant at Stavely Cross.</p>
<p>The environmental regulator sets abstraction licences and requires the Authority to reduce abstraction from the Elm Valley boreholes in dry years to protect river flows. The plan assumes that the licence change proposed for 2030 is confirmed.</p>
<h2>2.3 Climate resilience</h2>
<p>Climate projections for the region show hotter, drier summers and wetter winters with more intense rainfall. Both trends affect water assets: dry summers raise demand and shrink clay soils, which increases bursts; wet winters flood low-lying sites and raise the turbidity of river water.</p>
<p>The Authority has assessed the flood risk at all operational sites. Eleven sites are at risk from a flood with a one per cent annual probability, and four of them are critical. The plan includes flood protection at those four sites and the relocation of control kiosks above flood level at the others.</p>
<p>The plan also includes measures to keep supplies going during power cuts, which are expected to become more frequent during storms. All strategic pumping stations will have standby generation or a second, independent power supply by 2032.</p>
<h2>2.4 Affordability</h2>
<p>The investment in this plan would add about 4.1 per cent in real terms to the average household bill by 2036, before the effect of efficiency savings. The Authority’s social tariff will continue to cap bills for households on low incomes at 3 per cent of household income.</p>
<p>To keep bills affordable, the plan phases the largest schemes so that expenditure is spread across both regulatory periods, and gives priority to interventions that reduce operating costs, such as pump replacement and pressure management.</p>

<h1>3 Asset base overview</h1>
<p>The table below summarises the main asset classes across all twenty-four supply zones, with their replacement value at 2026/27 prices. Network assets account for more than three quarters of the total value; treatment works and service reservoirs account for most of the rest.</p>
<table><thead><tr><th>Asset class</th><th>Quantity</th><th>Unit</th><th>Replacement value (£m)</th><th>Share of value (%)</th></tr></thead><tbody>
<tr><td>Trunk mains</td><td class="num">1,184</td><td>km</td><td class="num">1,066</td><td class="num">27.4</td></tr>
<tr><td>Distribution mains</td><td class="num">6,912</td><td>km</td><td class="num">1,935</td><td class="num">49.8</td></tr>
<tr><td>Treatment works</td><td class="num">9</td><td>no.</td><td class="num">412</td><td class="num">10.6</td></tr>
<tr><td>Service reservoirs</td><td class="num">61</td><td>no.</td><td class="num">238</td><td class="num">6.1</td></tr>
<tr><td>Pumping stations</td><td class="num">94</td><td>no.</td><td class="num">131</td><td class="num">3.4</td></tr>
<tr><td>Customer meters</td><td class="num">214,600</td><td>no.</td><td class="num">54</td><td class="num">1.4</td></tr>
<tr><td>Telemetry and control</td><td class="num">812</td><td>outstations</td><td class="num">27</td><td class="num">0.7</td></tr>
<tr><td>Other</td><td class="num">–</td><td>–</td><td class="num">23</td><td class="num">0.6</td></tr>
</tbody></table>
<p>The median age of the mains network is 54 years. About 18 per cent of distribution mains are cast iron laid before 1940, and these account for 46 per cent of bursts. The replacement rate in the last regulatory period was 0.4 per cent of the network per year; this plan raises it to 0.7 per cent, targeted at the mains with the highest burst rates.</p>
<p>Service reservoirs are on average 71 years old. The condition survey completed in 2025 graded 17 of them at condition grade 4 or 5. Most of the defects are in roofs and roof membranes, which are the main route for contamination, and in the internal coatings of the older concrete tanks.</p>

<h1>4 Treatment works</h1>
<p>The Authority operates nine treatment works and source sites. Together they can put up to 286 megalitres per day into supply, against a peak week demand of 248 megalitres per day in 2025. This chapter describes each site, the condition of its main process stages and the work planned for 2027–2036.</p>
${works.map(worksHtml).join('\n')}

<h1>5 Supply zone profiles</h1>
<p>This chapter describes each of the twenty-four supply zones in the same order as the regional supply map. For each zone it gives an asset register summary, the condition and performance of the assets, the main risks and the interventions planned for 2027–2036. Intervention references (AMP-zone-number) are used in the capital programme in Chapter 6.</p>
${z.map((zz) => zoneHtml(zz, v)).join('\n')}

<h1>6 Capital programme</h1>
<p>The interventions in the zone profiles add up to a ten-year capital programme of about £${fmt(capex.reduce((s, c) => s + c.total, 0) / 100, 0)} million at 2026/27 prices. The table shows the programme by year and by category of asset. Treatment works schemes are planned separately but are shown here so that the whole programme is in one place.</p>
<table><thead><tr><th>Year</th><th>Mains (£k)</th><th>Storage (£k)</th><th>Pumping (£k)</th><th>Treatment (£k)</th><th>Telemetry (£k)</th><th>Total (£k)</th></tr></thead><tbody>${capexRows}</tbody></table>
<p>The programme is front-loaded towards storage in the first five years because of the undertakings agreed with the drinking water inspectorate. Mains renewal rises steadily to reach its full rate by 2030, which gives the contractor framework time to build up capacity.</p>
<p>Schemes with a value above £5 million have been through an independent cost review. The review found that the estimates were reasonable but that the risk allowance for two reservoir schemes was too low; those allowances have been raised from 15 to 25 per cent.</p>
<p>About 12 per cent of the programme is not yet assigned to named schemes. It is held as a reactive allowance for failures that cannot be predicted, such as a trunk main burst on a crossing, and is released by the investment committee when a need arises.</p>

<h1>7 Operating costs and financing</h1>
<p>Operating costs are affected by the plan in two ways. New assets such as storage tanks and pressure management schemes add maintenance and energy costs, while replacing old pumps and reducing leakage lowers them. The net effect is estimated as a saving of £1.9 million a year by 2036.</p>
<p>The table below compares the operating budget for 2025/26 with the outturn, by cost category. Positive variances are underspends; negative variances are overspends. The largest variance is in energy, where the price agreed for 2025/26 was higher than assumed when the budget was set.</p>
<table><thead><tr><th>Cost category</th><th>Budget (£k)</th><th>Outturn (£k)</th><th>Variance (£k)</th></tr></thead><tbody>${varRows}</tbody></table>
<p>Energy is the most volatile operating cost. The Authority buys about 60 per cent of its electricity under a fixed-price contract and the rest on the wholesale market. The plan assumes that the fixed share rises to 80 per cent from 2028, and that the solar arrays at three treatment works supply 6 per cent of demand.</p>
<p>The capital programme will be financed from a mix of retained revenue, borrowing and developer contributions. Gearing is forecast to stay below 60 per cent throughout the planning period. The financial plan assumes the cost of debt set in the regulator’s final determination.</p>
<p>The Authority will continue to seek external funding for schemes with wider benefits, such as catchment management and flood protection that also protects other infrastructure. No external funding is assumed in the figures in this chapter.</p>

<h1>8 Risk and assurance</h1>
<p>The main risks to delivering the plan are recorded in the risk register below. Each risk is scored for likelihood and impact on a scale of 1 to 5. The register is reviewed every quarter by the executive team and twice a year by the audit and risk committee.</p>
<table><thead><tr><th>Ref.</th><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Main controls</th></tr></thead><tbody>${riskRows}</tbody></table>
<p>The plan has been assured in three ways. The cost estimates were reviewed by an independent cost consultant; the asset data and condition assessments were audited by the internal audit team; and the prioritisation method was reviewed by an external panel of asset management practitioners. Their findings and the Authority’s responses are available on request.</p>
<p>Data quality remains the main limitation of the plan. The asset register still contains about 4,200 mains with an unknown installation date, and the condition of buried assets is mostly inferred from bursts rather than inspected. The Authority will continue its sampling programme of pipe condition assessments to improve the data.</p>

<h1>9 Delivery and monitoring</h1>
<p>Delivery of the plan will be monitored against the key performance indicators below, which are aligned with the performance commitments agreed with the regulator. Progress will be reported to the Board every six months and published in the annual performance report.</p>
<table><thead><tr><th>Indicator</th><th>2025/26 actual</th><th>2031 target</th><th>2036 target</th></tr></thead><tbody>${kpiRows}</tbody></table>
<p>If an indicator falls behind its trajectory for two consecutive reports, the Asset Strategy Group will prepare a recovery plan for the executive team. The plan will be reviewed in full every five years, and earlier if there is a significant change in regulation, demand or funding.</p>

<h1>Appendix A Glossary</h1>
<dl>${glossaryRows}</dl>

<h1>Appendix B Mains renewal schedule 2027–2031</h1>
<p>The schedule lists the mains renewal schemes planned for the first five years. Lengths are design estimates and may change by up to 10 per cent at detailed design. Material codes: CI cast iron, AC asbestos cement, GS galvanised steel, DI ductile iron, PVC unplasticised PVC.</p>
<table><thead><tr><th>Ref.</th><th>Zone</th><th>Location</th><th>Material</th><th>Diameter (mm)</th><th>Length (m)</th><th>Year</th><th>Method</th></tr></thead><tbody>${mainsSchedule(before).map((m) => `<tr><td class="ref">${m.ref}</td><td>${m.zone}</td><td>${m.loc}</td><td>${m.mat}</td><td class="num">${m.dia}</td><td class="num">${fmt(m.len)}</td><td class="num">${m.year}</td><td>${m.method}</td></tr>`).join('')}</tbody></table>

<h1>Appendix C Service reservoir schedule</h1>
<p>All 61 service reservoirs, with their capacity, the year of construction, the condition grade from the 2025 survey and the action planned in this plan.</p>
<table><thead><tr><th>Reservoir</th><th>Zone</th><th>Capacity (Ml)</th><th>Built</th><th>Grade</th><th>Planned action</th></tr></thead><tbody>${reservoirSchedule().map((x) => `<tr><td>${x.name}</td><td>${x.zone}</td><td class="num">${fmt(x.cap, 1)}</td><td class="num">${x.built}</td><td class="num">${x.grade}</td><td>${x.action}</td></tr>`).join('')}</tbody></table>

<h1>Appendix D Record of approval</h1>
<p>This plan was prepared by the Asset Strategy Group and reviewed by the executive team before submission to the Board.</p>
<table class="signoff"><thead><tr><th>Step</th><th>Body</th><th>Date</th></tr></thead><tbody>
<tr><td>Prepared</td><td>Asset Strategy Group</td><td>9 January 2027</td></tr>
<tr><td>Reviewed</td><td>Executive team</td><td>3 February 2027</td></tr>
<tr><td>Assured</td><td>Audit and risk committee</td><td>24 February 2027</td></tr>
<tr><td>Approved</td><td>Board of the Authority</td><td>${before ? '18' : '25'} March 2027</td></tr>
</tbody></table>
<p>Synthetic sample. This document was generated for software testing and does not describe a real organisation.</p>
</body></html>`;
}

export const pdfOptions = {
  format: 'A4',
  margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-family:'Liberation Sans',sans-serif;font-size:7.5pt;color:#555;width:100%;padding:0 20mm;display:flex;justify-content:space-between"><span>${ORG}</span><span>Asset Management Plan 2027–2036</span></div>`,
  footerTemplate: `<div style="font-family:'Liberation Sans',sans-serif;font-size:7.5pt;color:#555;width:100%;padding:0 20mm;display:flex;justify-content:space-between"><span>Synthetic sample — fictional data</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
};

const e3 = zoneData(E3_ZONE);
const e8 = { b: mainsSchedule(true)[E8_ROW], a: mainsSchedule(false)[E8_ROW] };
const rowText = (m) => `${m.ref} ${m.zone} ${m.loc} ${m.mat} ${m.dia} ${fmt(m.len)}`;

export const truth = {
  description: 'Ten-year asset management plan of a fictional water utility (cover, 9 chapters with 9 templated treatment-works profiles and 24 templated supply-zone profiles, tables, glossary, a 600-row mains renewal schedule, a reservoir schedule and an approval record), 84 A4 pages (85 after the edits), printed by Chromium with running header and "Page X of Y" footer. Eight scattered edits: a paragraph and a five-row table inserted in section 1.3 on page 2, which push every later page down by about a third of a page (so every later page break, table split and repeated table header moves, and the document gains a page); a trunk-mains length in the Elmscar asset table; a sentence deleted in the Ivelstone condition paragraph; "quarterly" to "monthly" in the Pellow Bay risk paragraph; a missing minus sign restored on the Energy variance in the 2025/26 budget table (the old version printed 1,250 for an overspend); a new row R-16 added to the risk register; a scheme length in the 600-row mains renewal schedule in Appendix B; and the Board approval date on the last page. Zone totals, the capital programme and all other figures are unchanged. Re-flow, page breaks, repeated table header rows and footer page numbers change only as consequences.',
  truth: [
    { type: 'insert', new: 'In response to consultation feedback, this version also sets out how the Authority will report progress against the plan to customers each year', oldAnchor: 'resilience of supplies to rural villages', maxItems: 3, note: 'A new paragraph plus a new five-row table "Theme raised in consultation" in section 1.3 (one inserted block, about a third of a page; the table continues at the top of the next new page with its header row repeated); every later page shifts. Reporting it as paragraph + table rows on each page (up to 3 items) is acceptable.' },
    { type: 'number', old: '148.6', new: '152.9', note: 'Trunk mains quantity (km) in the Elmscar asset register table.' },
    { type: 'delete', old: 'A further 2.3 km of cast-iron main beneath Harbour Street will be relined during the quay works', newAnchor: `lost ${fmt(e3.interruptions, 1)} minutes of supply per year to unplanned interruptions`, note: 'Whole last sentence of the Ivelstone "Condition and performance" paragraph (it continues "under a joint traffic management plan with the highway authority.").' },
    { type: 'replace', old: 'inspected quarterly', new: 'inspected monthly', note: 'Pellow Bay risk paragraph; only the frequency word changes.' },
    { type: 'number', old: '1,250', new: '−1,250', oldLocate: 'Energy 4,820 6,070 1,250', newLocate: 'Energy 4,820 6,070 −1,250', note: 'Energy row, Variance column of the 2025/26 budget table: sign added (overspend). Budget 4,820 and outturn 6,070 are unchanged.' },
    { type: 'insert', new: 'Single approved supplier of sodium hypochlorite for disinfection', oldAnchor: 'Pollution incident at an abstraction point', note: 'New last row R-16 of the risk register in chapter 8 (likelihood 2, impact 5, controls "Second supplier qualified by 2028; 21 days of on-site stock").' },
    { type: 'number', old: '1,180', new: '1,810', oldLocate: rowText(e8.b), newLocate: rowText(e8.a), note: `Length (m) of scheme ${e8.b.ref} (${e8.b.zone}, ${e8.b.loc}) in the mains renewal schedule, Appendix B; transposed digits corrected.` },
    { type: 'number', old: '18 March 2027', new: '25 March 2027', note: 'Board approval date in the record of approval on the last page; only the day changes.' },
  ],
};
