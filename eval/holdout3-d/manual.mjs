// Content of the synthetic PX-200 service manual (case holdout3-d-chromium-a5-manual).
// The product, the manufacturer and every value are invented; the document says
// so on its first page and in every footer. Not usable for real equipment.
//
// manualHtml(v) -> HTML for Chromium, A5 portrait, continuous flow (no forced
// page breaks), so an insertion early on shifts every later page.
//   v.faceShield  boolean  extra warning paragraph at the end of section 1.4
//   v.rotorTorque string   tightening torque of the rotor fixing screw (section 12.3)
//   v.gloves      string   glove material in section 13

const P = (t) => `<p>${t}</p>`;
const UL = (items) => `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const OL = (items) => `<ol>${items.map((t) => `<li>${t}</li>`).join('')}</ol>`;
const table = (head, rows, cls = '') => `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const css = `
  @page { size: A5; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Liberation Sans', sans-serif; font-size: 10pt; line-height: 1.5; color: #1c232b; padding: 0 13mm; }
  h1 { font-size: 14pt; margin: 16pt 0 7pt; color: #0d3b5c; break-after: avoid; }
  h2 { font-size: 11pt; margin: 11pt 0 4pt; color: #0d3b5c; break-after: avoid; }
  p { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 6pt; padding-left: 6mm; }
  li { margin: 0 0 2pt; }
  table { border-collapse: collapse; width: 100%; margin: 3pt 0 8pt; font-size: 8.5pt; line-height: 1.35; }
  th, td { border-bottom: 0.5pt solid #b9c3cc; padding: 3pt 4pt; text-align: left; vertical-align: top; }
  th { border-bottom: 1pt solid #0d3b5c; font-weight: bold; }
  tr { break-inside: avoid; }
  table.num td + td, table.num th + th { text-align: right; }
  table.record td { height: 16pt; }
  .title { margin: 6mm 0 8mm; }
  .title h1 { font-size: 19pt; margin: 0 0 3pt; }
  .title .sub { font-size: 10pt; color: #44525e; }
  .note { font-size: 8pt; color: #44525e; }
  .warn { border-left: 2.5pt solid #c0392b; padding: 2pt 0 2pt 6pt; margin: 4pt 0 8pt; }
`;

export const manualPdfOptions = {
  format: 'A5',
  displayHeaderFooter: true,
  margin: { top: '15mm', bottom: '15mm', left: '0', right: '0' },
  headerTemplate: `<div style="font-size:6.5pt;width:100%;padding:0 13mm;color:#6b7782;font-family:'Liberation Sans',sans-serif">PX-200 peristaltic dosing pump · Service manual</div>`,
  footerTemplate: `<div style="font-size:6.5pt;width:100%;padding:0 13mm;color:#6b7782;font-family:'Liberation Sans',sans-serif;display:flex;justify-content:space-between"><span>Synthetic sample, not for use with real equipment</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
};

const parameters = [
  ['P01', 'Language', 'English, Deutsch, Français, Español', 'English'],
  ['P02', 'Units', 'ml/min, l/h, gal/h', 'l/h'],
  ['P03', 'Display contrast', '1–10', '6'],
  ['P04', 'Access code', '0000–9999', '0000'],
  ['P05', 'Hose size', '1.6, 3.2, 4.8, 6.4, 8.0 mm', '4.8 mm'],
  ['P06', 'Operating mode', 'manual, pulse, analogue, batch, timer', 'manual'],
  ['P07', 'Manual rate', '0.5–100 %', '50 %'],
  ['P08', 'Maximum speed', '10–100 %', '100 %'],
  ['P09', 'Ramp time', '0–10 s', '2 s'],
  ['P10', 'Direction of rotation', 'clockwise, anticlockwise', 'clockwise'],
  ['P11', 'Pulse volume', '0.1–999 ml', '10 ml'],
  ['P12', 'Pulse memory', 'on, off', 'on'],
  ['P13', 'Pulse divider', '1–99', '1'],
  ['P14', 'Batch volume', '0.01–999 l', '1.00 l'],
  ['P15', 'Batch start', 'key, pulse, timer', 'key'],
  ['P16', 'Timer batches per day', '0–8', '0'],
  ['P17', 'Anti-drip reverse', '0–5 revolutions', '0'],
  ['P18', 'Leak sensor', 'on, off', 'on'],
  ['P19', 'Level input logic', 'NO, NC', 'NC'],
  ['P20', 'Analogue input range', '0–20 mA, 4–20 mA', '4–20 mA'],
  ['P21', 'Analogue lower point', '0–20 mA', '4.0 mA'],
  ['P22', 'Analogue upper point', '0–20 mA', '20.0 mA'],
  ['P23', 'Flow at upper point', '0–100 %', '100 %'],
  ['P24', 'Analogue output source', 'speed, flow, alarm', 'flow'],
  ['P25', 'Alarm relay function', 'fault, empty, pre-alarm, all', 'all'],
  ['P26', 'Alarm relay logic', 'energised, de-energised', 'energised'],
  ['P27', 'External stop logic', 'NO, NC', 'NO'],
  ['P28', 'Restart after power failure', 'automatic, manual', 'manual'],
  ['P29', 'Hose run time warning', '0–5000 h', '1500 h'],
  ['P30', 'Service interval', '0–8760 h', '4000 h'],
  ['P31', 'Calibration factor', '0.50–1.50', '1.00'],
  ['P32', 'Total volume counter', 'read only', '–'],
  ['P33', 'Hose run time counter', 'read only', '–'],
  ['P34', 'Fault history', 'read only', '–'],
  ['P35', 'Factory reset', 'yes, no', 'no'],
  ['P36', 'Firmware version', 'read only', '–'],
];

const faults = [
  ['No display', 'No supply, or the controller fuse has blown', 'Check the supply; replace the fuse (9.7)'],
  ['E01 Cover open', 'Pump head cover not closed', 'Close the cover and tighten the screws'],
  ['E02 Motor blocked', 'Rotor blocked by a foreign body or a twisted hose', 'Stop the pump; check the hose and the rotor'],
  ['E03 Overcurrent', 'Discharge pressure too high', 'Check the discharge line and the injection valve for blockage'],
  ['E04 Overtemperature', 'Ambient temperature too high, or the motor is covered', 'Improve the ventilation; let the motor cool down'],
  ['E05 Leak', 'Liquid at the leak sensor', 'Find and repair the leak; dry the sensor (9.5)'],
  ['E06 Tank empty', 'Level switch “empty” active', 'Refill the tank'],
  ['W07 Tank low', 'Level switch “pre-alarm” active', 'Prepare a refill'],
  ['E08 Analogue input', 'Input current below 3.5 mA with the range 4–20 mA', 'Check the signal cable and the signal source'],
  ['W09 Pulse overflow', 'More than 99 pulses stored', 'Increase the pulse volume or the pulse divider'],
  ['W10 Hose run time', 'Hose run time warning reached', 'Replace the hose element (9.1)'],
  ['W11 Service due', 'Service interval reached', 'Carry out the maintenance tasks and reset the counter'],
  ['E12 Memory', 'Parameter memory faulty', 'Reset to factory settings; contact service if the fault returns'],
  ['E13 Speed sensor', 'No signal from the motor speed sensor', 'Check the motor cable; replace the motor'],
  ['E14 External stop', 'External stop input active', 'Check the external stop circuit'],
  ['Pump runs, no flow', 'Hose not seated, suction line leaking or a valve closed', 'Check the hose position, the suction line and the valves'],
  ['Flow too low', 'Worn hose, out-of-date calibration or viscous liquid', 'Replace the hose; recalibrate the pump'],
  ['Flow too high', 'Siphoning through the pump at low counter-pressure', 'Fit an injection valve or a pressure-holding valve'],
  ['Hose bursts early', 'Discharge pressure too high, or unsuitable hose material', 'Check the pressure and the hose material'],
  ['Liquid in the pump head', 'Hose burst or connector leaking', 'Stop the pump; clean the head; replace the hose'],
  ['Noise from the pump head', 'Roller bearings worn or the track is dry', 'Inspect the rollers (9.2); clean the track (9.3)'],
  ['Wrong display language', 'Parameter P01 changed', 'Set P01 to the required language'],
];

const models = [['S', '1.6 / 3.2'], ['M', '4.8'], ['L', '6.4'], ['XL', '8.0'], ['HP', '3.2'], ['EX', '4.8']];
function spareParts() {
  const perModel = [
    ['Hose element, TPE, ID {h} mm', true], ['Hose element, silicone, ID {h} mm', false], ['Hose element, FKM, ID {h} mm', false],
    ['Rotor, complete with three rollers', false], ['Roller set (3 rollers with bearings)', true], ['Pump head cover with screws', false],
    ['Cover safety switch', false], ['Connector set, PVDF', true], ['Connector set, PP', false], ['Connector set, stainless steel', false],
    ['Injection valve, PVDF', false], ['Injection valve, PP', false], ['Seal kit for injection valve', true], ['Planetary gearbox', false],
    ['BLDC motor with speed sensor', false], ['Controller board', false], ['Pump head housing with track', false],
    ['Shaft seal', true], ['Hose lever', false], ['Controller cover seal', false],
  ];
  const common = [
    ['Display module', false], ['Keypad foil', false], ['Fuse set, 5 × T 2 A', true], ['Leak sensor with 1 m cable', true],
    ['Mains cable, 2 m, with plug', false], ['Wall bracket with locking screw', false], ['Drilling template', false], ['Silicone grease, 20 g', true],
  ];
  const rows = [];
  let n = 1104;
  for (const [m, hose] of models) {
    for (const [d, stock] of perModel) {
      rows.push([`PX2-${n}`, d.replace('{h}', hose), `PX-200-${m}`, stock ? 'yes' : '–']);
      n += 7;
    }
  }
  for (const [d, stock] of common) { rows.push([`PX2-${n}`, d, 'all', stock ? 'yes' : '–']); n += 7; }
  return rows;
}

const hoses = [['1.6', 0.8], ['3.2', 3.1], ['4.8', 6.9], ['6.4', 12.2], ['8.0', 18.9]];
const speeds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const flowRows = hoses.map(([id, k]) => [`${id} mm`, ...speeds.map((s) => (k * s).toFixed(k * s < 100 ? 1 : 0))]);
const lifeRows = (pressureFactor) => hoses.map(([id], i) => [`${id} mm`, ...[25, 50, 75, 100].map((s) => String(Math.round((4200 - i * 380) * pressureFactor * (50 / s) ** 0.7 / 10) * 10))]);

export function manualHtml(v) {
  const body = `
  <div class="title">
    <h1>PX-200 peristaltic dosing pump</h1>
    <div class="sub">Service manual · Edition 03/2028 · Original instructions</div>
    <div class="sub">Aldermoor Fluid Systems</div>
    <p class="note" style="margin-top:4pt">Synthetic sample: the product, the manufacturer and all values in this manual are invented. Do not use it for real equipment.</p>
  </div>

  <h1>1 Safety</h1>
  <h2>1.1 About this manual</h2>
  ${P('This manual describes the installation, operation and maintenance of the PX-200 series of peristaltic dosing pumps. Read it completely before you install or operate the pump, and keep it near the pump for later reference. The menus described here refer to firmware version 2.4 and later.')}
  <h2>1.2 Signal words</h2>
  ${UL(['<b>DANGER</b> marks a hazard that will cause death or serious injury if it is not avoided.', '<b>WARNING</b> marks a hazard that can cause death or serious injury.', '<b>CAUTION</b> marks a hazard that can cause minor injury or damage to the pump.', '<b>NOTE</b> gives information that makes the work easier.'])}
  <h2>1.3 Intended use</h2>
  ${P('The PX-200 is intended for dosing liquid chemicals in water treatment, cooling water and process applications. The pump may be used only with liquids that are compatible with the hose material and the pump head, and only within the limits given in the technical data. Any other use is not intended and may cause injury or damage.')}
  <h2>1.4 General safety instructions</h2>
  ${UL([
    'Disconnect the mains supply and secure it against reconnection before you open the terminal box or the pump head.',
    'Do not operate the pump with the pump head cover removed: the rotor can trap fingers.',
    'Check the safety data sheet of the dosed liquid and wear the protective equipment it requires.',
    'Relieve the pressure in the discharge line before you disconnect it.',
    'Collect leaking liquid and dispose of it according to local regulations.',
    'Use only original spare parts. Other parts can affect the safety of the pump and void the warranty.',
    'Do not modify the pump or its software. Modifications require written approval from the manufacturer.',
  ])}
  ${v.faceShield ? `<div class="warn">${P('<b>WARNING</b> Wear a face shield when you open the discharge line, even after the pressure has been relieved: liquid can still spray from the hose or the connector. Keep an eye-wash bottle within reach of the pump, and rinse splashes on the skin or in the eyes at once with plenty of clean water. Report every such incident to the person responsible for the installation.')}</div>` : ''}
  <h2>1.5 Personnel</h2>
  ${P('Installation, electrical connection and maintenance must be carried out by trained specialists who are familiar with this manual and with the regulations that apply on site. Operators must be instructed in the use of the pump and in the hazards of the dosed liquid.')}
  <h2>1.6 Residual risks</h2>
  ${P('Even when the pump is used as intended, some risks remain: chemicals can escape if a hose bursts, the motor surface can become hot after long operation at full speed, and the pump can start unexpectedly on a remote signal. Install a leak sensor and an external stop where these risks are not acceptable.')}

  <h2>1.7 Warranty</h2>
  ${P('The warranty covers defects in material and workmanship for 24 months from delivery. It does not cover wear parts such as hoses, rollers and injection valve seals, or damage caused by unsuitable liquids, incorrect installation or the use of non-original parts. Warranty claims must be made in writing and must include the serial number and a description of the fault.')}

  <h2>1.8 Labels on the pump</h2>
  ${table(['Label', 'Position', 'Meaning'], [
    ['Rotating parts', 'pump head cover', 'Do not open the cover while the pump is running.'],
    ['Hot surface', 'motor housing', 'The surface can exceed 60 °C after long operation.'],
    ['Read the manual', 'controller cover', 'Read this manual before installation and maintenance.'],
    ['Direction of flow', 'pump head, both connectors', 'Arrow from the suction side to the discharge side.'],
    ['Earth terminal', 'terminal box', 'Connection point for the protective earth conductor.'],
    ['Rating plate', 'right-hand side', 'Model, serial number and electrical data.'],
  ])}
  ${P('Replace labels that are damaged or no longer legible. Replacement labels are part of the service kit.')}

  <h1>2 Product description</h1>
  <h2>2.1 Overview</h2>
  ${P('The PX-200 is a peristaltic pump: a rotor with three rollers squeezes a flexible hose against the curved track of the pump head and pushes the liquid forward. The liquid touches only the hose and the connectors, so the pump has no valves or seals in contact with the liquid. It can run dry without damage and can pump liquids that contain gas bubbles or solids.')}
  <h2>2.2 Models</h2>
  ${table(['Model', 'Flow (l/h)', 'Max. pressure (bar)', 'Hose ID (mm)', 'Motor (W)'], [
    ['PX-200-S', '0.1–12', '7', '1.6 / 3.2', '40'], ['PX-200-M', '0.4–48', '7', '4.8', '60'], ['PX-200-L', '1.0–120', '4', '6.4', '90'],
    ['PX-200-XL', '2.0–230', '3', '8.0', '120'], ['PX-200-HP', '0.2–20', '12', '3.2', '90'], ['PX-200-EX', '0.4–48', '7', '4.8', '60'],
  ])}
  ${P('The PX-200-EX has a conductive housing and is intended for areas where explosive atmospheres can occur. Its additional instructions are given in a separate supplement and take precedence over this manual.')}
  <h2>2.3 Pump head</h2>
  ${P('The pump head consists of the housing with the hose track, the rotor with three rollers, the hose element and the transparent cover. The cover is fixed with four screws and has a safety switch that stops the motor when the cover is opened. The hose element is supplied ready for installation, with both connectors pressed on.')}
  <h2>2.4 Drive and controller</h2>
  ${P('The drive consists of a brushless DC motor and a two-stage planetary gearbox. The controller adjusts the motor speed between 0.5 and 100 % of the nominal speed and counts the revolutions of the rotor, so that the dosed volume can be calculated without a flow meter. A calibration value is stored for each hose size.')}
  <h2>2.5 Rating plate</h2>
  ${P('The rating plate is on the right-hand side of the housing. It shows:')}
  ${UL(['model and serial number;', 'year of manufacture;', 'supply voltage and frequency;', 'power consumption;', 'maximum discharge pressure;', 'degree of protection.'])}
  ${P('Quote the model and the serial number in all enquiries and spare part orders.')}
  <h2>2.6 Scope of delivery</h2>
  ${UL(['pump with controller and mains cable;', 'hose element installed in the pump head;', 'wall bracket with locking screw and drilling template;', 'connector set for the suction and discharge lines;', 'leak sensor with cable;', 'hose lever and union nut tool;', 'this manual and a quick reference card.'])}
  ${P('Check the delivery for completeness and for transport damage as soon as it arrives. Report any damage to the carrier and to your distributor within three working days.')}
  <h2>2.7 Dimensions</h2>
  ${table(['Model', 'Width (mm)', 'Height (mm)', 'Depth (mm)', 'Weight (kg)'], [
    ['PX-200-S', '190', '240', '170', '4.8'], ['PX-200-M', '205', '250', '185', '5.6'], ['PX-200-L', '225', '265', '205', '6.7'],
    ['PX-200-XL', '240', '280', '220', '7.9'], ['PX-200-HP', '205', '250', '200', '6.1'], ['PX-200-EX', '205', '250', '185', '6.0'],
  ], 'num')}

  <h1>3 Installation</h1>
  <h2>3.1 Location</h2>
  ${P('Install the pump in a dry, frost-free place that is protected from direct sunlight. The ambient temperature must be between 0 and 45 °C.')}
  ${UL(['Leave at least 30 cm of free space in front of the pump head for hose changes.', 'Install the pump below the level of the storage tank where possible, so that the suction line stays filled.', 'Provide a drip tray or bund under the pump and the storage tank.', 'Keep the pump away from heat sources and from vibrating machines.'])}
  <h2>3.2 Mounting</h2>
  ${P('The pump can be mounted on a wall bracket, on a console or directly on the lid of a storage tank.')}
  ${OL(['Mark the four fixing holes with the drilling template supplied.', 'Drill the holes and insert suitable wall plugs.', 'Fix the bracket with four M6 screws.', 'Hang the pump on the bracket and secure it with the locking screw.', 'Check that the pump head is horizontal and easy to reach.'])}
  <h2>3.3 Suction and discharge lines</h2>
  ${P('Use hoses or pipes whose material is compatible with the dosed liquid. The inner diameter of the suction line must be at least as large as that of the pump hose, and the suction line should be as short as possible.')}
  ${P('Install a pressure relief valve in the discharge line if the line can be closed while the pump is running, for example by a manual valve or a blocked injection nozzle. Without such a valve, the pressure can rise until the hose bursts.')}
  ${P('Fit the injection valve at the dosing point. It prevents the dosing line from draining and keeps liquid from the main line out of the dosing line.')}
  <h2>3.4 Electrical connection</h2>
  ${P('The pump is supplied with a 2 m mains cable with a plug. Signal and alarm cables are connected in the terminal box under the controller cover.')}
  ${table(['Terminal', 'Function', 'Rating'], [
    ['X1.1–X1.3', 'Mains supply L, N, PE', '100–240 V AC, 50/60 Hz'], ['X2.1–X2.2', 'Pulse input', '5–30 V DC, max. 100 Hz'],
    ['X2.3–X2.4', 'Analogue input', '0/4–20 mA, 250 Ω'], ['X2.5–X2.6', 'External stop', 'potential-free contact'],
    ['X3.1–X3.2', 'Level switch, pre-alarm', 'potential-free contact'], ['X3.3–X3.4', 'Level switch, empty', 'potential-free contact'],
    ['X4.1–X4.3', 'Alarm relay', '250 V AC, 2 A, changeover'], ['X4.4–X4.5', 'Analogue output', '4–20 mA, max. 500 Ω'],
    ['X5.1–X5.2', 'Leak sensor', 'supplied with the pump'], ['X6', 'Service interface', 'USB-C'],
  ])}
  ${P('Lay signal cables separately from mains cables. Use screened cable for the analogue input and output, and connect the screen at the pump end only.')}
  <h2>3.5 Signal inputs</h2>
  ${P('In pulse mode, the pump delivers a set volume for each pulse from a water meter. In analogue mode, the flow is proportional to the input current; the range is set with parameters P20 to P23. The external stop input has priority over all operating modes.')}

  <h2>3.6 Installation examples</h2>
  ${P('<b>Dosing into a pressurised pipe.</b> Fit the injection valve on top of the pipe or at the side, never at the bottom, where sediment collects. The opening pressure of the injection valve must be higher than the pressure difference between the tank and the dosing point; otherwise liquid can siphon through the pump when it is stopped. In pipes with changing pressure, add a pressure-holding valve close to the pump.')}
  ${P('<b>Dosing into an open tank.</b> Lead the discharge line into the tank from above and end it below the lowest liquid level, so that the dosed liquid mixes quickly. Fix the end of the line so that it cannot move out of the liquid when the mixer runs. An injection valve is not needed, but a non-return valve prevents the line from draining.')}
  ${P('<b>Dosing with a pulse water meter.</b> Connect the meter to the pulse input and select pulse mode. The pulse volume is calculated from the meter constant and the required dose. Example: the meter gives one pulse per 10 litres and the required dose is 2 ml of product per 100 litres of water; set the pulse volume P11 to 0.2 ml.')}
  ${P('<b>Suction from a drum.</b> Use a suction lance with a foot valve and a level switch, and place the drum in a bund. Keep the suction height below 3 m for water-like liquids and below 1.5 m for liquids that release gas. Replace the drum only when the pump has stopped and the “tank empty” message is shown.')}

  <h1>4 Commissioning</h1>
  ${OL([
    'Check that the supply voltage matches the rating plate.',
    'Check that all hose connections are tight and that the valves in the suction and discharge lines are open.',
    'Switch on the supply. The display shows the firmware version and then the main screen.',
    'Select the language and the units in the setup menu.',
    'Select the installed hose size in parameter P05.',
    'Prime the pump: press and hold the PRIME key until liquid flows from the discharge line without bubbles.',
    'Calibrate the pump as described in section 6.',
    'Set the operating mode and the dosing rate.',
    'Check the installation for leaks during the first hour of operation.',
    'Record the commissioning data in the maintenance record at the end of this manual.',
  ])}
  ${P('If the pump does not deliver, check the direction of rotation shown on the display and the position of the hose in the track.')}
  <h2>4.1 Commissioning record</h2>
  ${P('Copy this table into the maintenance record or the plant documentation.')}
  ${table(['Item', 'Value'], [['Date of commissioning', ''], ['Serial number', ''], ['Firmware version', ''], ['Hose size and material', ''], ['Calibration factor (P31)', ''], ['Operating mode (P06)', ''], ['Dosing rate or pulse volume', ''], ['Commissioned by', '']], 'record')}

  <h1>5 Operation</h1>
  <h2>5.1 Control panel</h2>
  ${P('The control panel has a backlit display and six keys.')}
  ${table(['Key', 'Function'], [
    ['START/STOP', 'Starts or stops dosing in all modes'], ['PRIME', 'Runs the pump at full speed while the key is pressed'],
    ['MENU', 'Opens the parameter menu; pressed again, returns to the main screen'], ['UP / DOWN', 'Change the selected value'],
    ['OK', 'Confirms a value or opens the selected menu item'],
  ])}
  <h2>5.2 Operating modes</h2>
  ${P('<b>Manual mode.</b> The pump runs continuously at the set rate in ml/min or l/h.')}
  ${P('<b>Pulse mode.</b> Each input pulse starts the delivery of a set volume. Pulses that arrive during a delivery are stored, up to 99 pulses.')}
  ${P('<b>Analogue mode.</b> The flow follows the input current. Below the lower point of the range the pump stops; above the upper point it runs at the flow set for the upper point.')}
  ${P('<b>Batch mode.</b> The pump delivers a set volume and stops. A new batch is started with the START key or with a pulse at the pulse input.')}
  ${P('<b>Timer mode.</b> Up to eight batches per day are started at set times. The internal clock keeps the time for at least five days without supply.')}
  <h2>5.3 Parameter list</h2>
  ${table(['Code', 'Parameter', 'Range', 'Default'], parameters)}
  ${P('Parameters P04, P10 and P31 to P35 are only shown after the access code has been entered.')}
  <h2>5.4 Menu structure</h2>
  ${table(['Menu', 'Contents'], [
    ['Setup', 'language, units, display contrast, access code, hose size'], ['Operation', 'operating mode, rates, volumes, batch and timer settings'],
    ['Inputs', 'pulse input, analogue input, external stop, level switches, leak sensor'], ['Outputs', 'alarm relay, analogue output'],
    ['Service', 'calibration, counters, firmware update, factory reset'], ['Info', 'model, serial number, firmware version, fault history'],
  ])}
  ${P('Use UP and DOWN to move between menu items and OK to open an item. The menu closes automatically when no key is pressed for two minutes; values that have not been confirmed with OK are discarded.')}
  <h2>5.5 Counters and messages</h2>
  ${P('The controller keeps three counters: the total volume dosed since commissioning, the run time of the installed hose and the time since the last service. The total volume counter cannot be reset. The hose run time counter is reset after a hose change, and the service counter after a service. When a counter reaches the limit set in P29 or P30, the display shows a warning and the alarm relay switches if it is set to “all”.')}
  ${P('The last 50 faults and warnings are stored with date and time in the fault history (P34). The history is kept during a firmware update and after a power failure.')}
  <h2>5.6 Remote monitoring</h2>
  ${P('The analogue output gives a signal of 4–20 mA that follows the speed, the flow or the alarm state, as set in P24. With the setting “alarm”, the output is 4 mA in normal operation, 12 mA when a warning is active and 20 mA when a fault has stopped the pump. Together with the alarm relay this allows a control system to monitor the pump without a data connection.')}

  <h1>6 Flow calibration</h1>
  ${P('The controller converts the rotor speed into a flow rate with a calibration value for each hose size. The factory values are typical values for new hoses at 20 °C and a discharge pressure of 1 bar. Calibrate the pump after commissioning, after every hose change and whenever the dosed liquid changes.')}
  ${OL(['Fill a measuring cylinder with the dosed liquid and place the end of the suction line in it.', 'Start the calibration in the menu Service › Calibration.', 'Let the pump run for at least 60 seconds, or until at least 100 ml have been drawn.', 'Enter the volume drawn from the cylinder.', 'Confirm the new calibration factor with OK.'])}
  ${P('Typical flow in ml/min at 1 bar, by hose inner diameter and speed (% of nominal speed):')}
  ${table(['Hose', ...speeds.map((s) => `${s} %`)], flowRows, 'num')}
  ${P('Higher discharge pressure, viscous liquids and worn hoses reduce the flow. With liquids that release gas, such as sodium hypochlorite, the flow can be up to 15 % lower than the table value.')}

  <h1>7 Hose life</h1>
  ${P('The life of the pump hose depends on the speed, the discharge pressure, the temperature and the dosed liquid. The tables give typical operating hours with water at 20 °C for TPE hoses. Silicone hoses reach about half of these values; FKM hoses about two thirds.')}
  ${P('Typical hose life in hours at 1 bar, by speed:')}
  ${table(['Hose', '25 %', '50 %', '75 %', '100 %'], lifeRows(1), 'num')}
  ${P('Typical hose life in hours at 4 bar, by speed:')}
  ${table(['Hose', '25 %', '50 %', '75 %', '100 %'], lifeRows(0.55), 'num')}
  ${P('Replace the hose at the latest when the hose run time warning appears, or earlier if the flow drops by more than 10 % after a calibration.')}
  <h2>7.1 Hose materials</h2>
  ${table(['Material', 'Temperature', 'Max. pressure', 'Typical use'], [
    ['TPE', '0 to 50 °C', '7 bar', 'standard hose for water treatment'], ['Silicone', '−20 to 80 °C', '2 bar', 'low-pressure applications'],
    ['FKM', '0 to 60 °C', '5 bar', 'oils and the solvents listed in the supplement'], ['EPDM', '0 to 60 °C', '4 bar', 'alkaline cleaning solutions'],
  ])}
  ${P('Check the compatibility of each liquid in the chemical resistance supplement before you select the hose material. If in doubt, ask the distributor for a test hose and check it for swelling after one week of operation.')}

  <h1>8 Maintenance</h1>
  <h2>8.1 Schedule</h2>
  ${table(['Task', 'Interval'], [
    ['Check the pump and the lines for leaks', 'daily'], ['Compare the dosed volume on the display with the tank level', 'weekly'],
    ['Clean the pump head cover', 'monthly'], ['Check the hose for swelling, cracks and flat spots', 'monthly'],
    ['Recalibrate the pump', 'after each hose change'], ['Replace the hose element', 'at the hose run time warning, at the latest every 12 months'],
    ['Inspect the rollers and the rotor bearings', 'at each hose change'], ['Clean the hose track', 'at each hose change'],
    ['Check the leak sensor', 'every 6 months'], ['Check the injection valve', 'every 6 months'],
    ['Replace the injection valve seals', 'every 12 months'], ['Check the terminal box for moisture and loose wires', 'every 12 months'],
    ['Replace the rotor', 'every 8,000 operating hours'], ['Replace the gearbox', 'every 20,000 operating hours'],
  ])}
  <h2>8.2 Maintenance by the operator</h2>
  ${P('The daily, weekly and monthly checks can be carried out by instructed operators. They do not require the pump head or the controller to be opened. Record any leak, unusual noise or deviation between the dosed volume and the tank level, and report it to the person responsible for maintenance.')}
  <h2>8.3 Maintenance by service personnel</h2>
  ${P('Hose changes, inspections of the pump head, work on the injection valve and all work on the electrical installation are carried out by trained service personnel. The intervals in the schedule apply to continuous operation at up to 50 % speed; at higher speeds, or with abrasive or crystallising liquids, shorten them according to experience.')}
  <h2>8.4 Service kits</h2>
  ${table(['Kit', 'Contents', 'Used for'], [
    ['Hose kit', 'hose element, connector seals, silicone grease', 'hose change (9.1)'],
    ['Roller kit', 'three rollers with bearings, retaining clips', 'roller replacement (9.2)'],
    ['Valve kit', 'O-rings, valve ball, sealing tape', 'injection valve service (9.6)'],
    ['Annual kit', 'hose kit, valve kit, controller cover seal, fuse set', 'annual service'],
    ['Rotor kit', 'rotor with rollers, rotor fixing screw, shaft seal', 'rotor replacement (9.4)'],
  ])}

  <h1>9 Maintenance procedures</h1>
  <div class="warn">${P('<b>WARNING</b> Stop the pump and disconnect the mains supply before every maintenance task, unless the procedure says otherwise.')}</div>
  <h2>9.1 Replacing the hose element</h2>
  ${OL([
    'Stop the pump and disconnect the mains supply.', 'Close the valves in the suction and discharge lines and relieve the pressure.',
    'Remove the four screws of the pump head cover and take off the cover.', 'Unscrew the union nuts of the hose connectors.',
    'Turn the rotor by hand with the hose lever and lift the old hose out of the track.', 'Clean the hose track and inspect the rollers (9.2 and 9.3).',
    'Insert the new hose element, starting at the suction side, and turn the rotor by hand until the hose lies evenly in the track.',
    'Tighten the union nuts by hand and then a quarter turn with the tool supplied.',
    'Fit the cover and tighten the screws to the torque given in the technical data.', 'Reset the hose run time counter (P33) and recalibrate the pump.',
  ])}
  <h2>9.2 Inspecting the rollers</h2>
  ${OL(['Remove the pump head cover.', 'Turn each roller by hand. It must turn freely, without noise or play.', 'Check the running surface for flat spots, cracks and deposits.', 'Replace the complete roller set if one roller is damaged; do not replace single rollers.', 'Fit the cover.'])}
  <h2>9.3 Cleaning the hose track</h2>
  ${OL(['Remove the hose element.', 'Wipe the track with a cloth moistened with water. Remove deposits of dried chemical with a plastic scraper; do not use metal tools.', 'Dry the track completely before you insert the new hose.', 'Apply a thin film of the silicone grease supplied to the track.'])}
  <h2>9.4 Replacing the rotor</h2>
  ${OL(['Remove the pump head cover and the hose element.', 'Hold the rotor and loosen the rotor fixing screw in the centre.', 'Pull the rotor off the shaft. If it is stuck, use the puller from the service kit.', 'Clean the shaft and check the shaft seal for leaks.', 'Push the new rotor onto the shaft until it stops, with the flat on the shaft aligned with the flat in the rotor hub.', 'Tighten the rotor fixing screw to the torque given in the technical data.', 'Insert the hose element and fit the cover.'])}
  <h2>9.5 Checking the leak sensor</h2>
  ${P('The leak sensor is a conductive probe at the lowest point of the pump head.')}
  ${OL(['Stop the pump.', 'Lift the sensor out of its holder and dip the tip into a cup of tap water.', 'The display must show the leak alarm, and the alarm relay must switch.', 'Dry the sensor, put it back in the holder and acknowledge the alarm with OK.'])}
  <h2>9.6 Servicing the injection valve</h2>
  ${OL(['Relieve the pressure in the discharge line.', 'Unscrew the injection valve from the main line.', 'Dismantle the valve and clean all parts in water.', 'Replace the O-rings and the valve ball from the seal kit.', 'Assemble the valve and check that the ball moves freely.', 'Refit the valve with new sealing tape on the thread.'])}
  <h2>9.7 Replacing the controller fuse</h2>
  ${OL(['Disconnect the mains supply.', 'Open the controller cover (four screws).', 'Remove the fuse holder cap and replace the fuse with one of the same type.', 'Close the cover and check that the seal is seated correctly.'])}
  <h2>9.8 Updating the firmware</h2>
  ${OL(['Download the firmware file from the manufacturer’s service portal.', 'Connect a computer to the service interface X6 with a USB-C cable.', 'Start the update in the menu Service › Firmware. The pump stops during the update.', 'Do not disconnect the supply until the display shows the main screen again.', 'Check the parameter settings; they are kept during the update.'])}

  <h2>9.9 Replacing the gearbox</h2>
  ${OL(['Disconnect the mains supply and remove the pump from the wall bracket.', 'Remove the pump head cover, the hose element and the rotor (9.4).', 'Remove the four screws of the pump head housing and lift the housing off.', 'Remove the four gearbox flange screws and pull the gearbox off the motor shaft.', 'Check the motor shaft and the coupling for wear.', 'Fit the new gearbox, aligning the coupling, and tighten the flange screws to the torque given in the technical data.', 'Refit the pump head housing, the rotor and the hose element.', 'Run the pump for ten minutes at full speed and check for noise and leaks.'])}
  <h2>9.10 Replacing the controller board</h2>
  ${OL(['Note the parameter settings, or save them to a computer through the service interface.', 'Disconnect the mains supply and wait two minutes.', 'Open the controller cover and disconnect all plugs from the board.', 'Remove the five board screws and lift out the board, holding it by the edges.', 'Fit the new board and reconnect the plugs; each plug fits only one socket.', 'Close the cover and switch on the supply.', 'Enter the parameter settings again and recalibrate the pump.'])}
  <h2>9.11 Cleaning the pump</h2>
  ${OL(['Stop the pump.', 'Wipe the housing and the display with a damp cloth. Do not use solvents or abrasive cleaners.', 'Clean the pump head cover with water and a mild detergent.', 'Check that the ventilation openings of the motor are free.', 'Remove dried chemical from the connectors with a soft brush.'])}
  <h2>9.12 Storing spare hoses</h2>
  ${P('Store spare hose elements in their original bag in a dark, dry place at 5 to 25 °C. Do not store them near ozone sources such as electric motors or welding equipment. Hoses older than three years should not be installed, even if they have never been used.')}

  <h1>10 Fault finding</h1>
  ${P('Faults (E) stop the pump and switch the alarm relay. Warnings (W) are shown on the display, but the pump continues to run. Acknowledge a message with OK after the cause has been removed.')}
  ${table(['Display or symptom', 'Possible cause', 'Remedy'], faults)}
  ${P('Before you contact service, note the model, the serial number, the firmware version and the last entries of the fault history. Check that the fault is not caused by the installation, for example a closed valve or a blocked injection valve.')}

  <h1>11 Spare parts and accessories</h1>
  <h2>11.1 Spare parts</h2>
  ${P('Order spare parts from your local distributor and quote the part number, the model and the serial number of the pump. Parts marked “yes” in the last column should be kept in stock on site.')}
  ${table(['Part no.', 'Description', 'Model', 'Stock'], spareParts())}
  <h2>11.2 Accessories</h2>
  ${table(['Part no.', 'Accessory'], [
    ['PX2-7010', 'Suction lance for 25 l containers, with level switch'], ['PX2-7017', 'Suction lance for 200 l drums, with level switch'],
    ['PX2-7024', 'Foot valve, PVDF, with strainer'], ['PX2-7031', 'Pressure relief valve, PVDF, 3–10 bar'],
    ['PX2-7038', 'Pressure-holding valve, PVDF, 1.5 bar'], ['PX2-7045', 'Pulsation damper, 0.2 l'],
    ['PX2-7052', 'Drip tray, polyethylene, 40 l'], ['PX2-7059', 'Console for tank lids'],
    ['PX2-7066', 'Signal cable, 5 m, screened'], ['PX2-7073', 'Signal cable, 10 m, screened'],
    ['PX2-7080', 'Pulse water meter adapter'], ['PX2-7087', 'USB-C service cable, 2 m'],
    ['PX2-7094', 'Service kit with puller, torque screwdriver bits and hose lever'], ['PX2-7101', 'Dosing line, PE, 4/6 mm, 50 m'],
    ['PX2-7108', 'Dosing line, PTFE, 4/6 mm, 25 m'], ['PX2-7115', 'Calibration cylinder, 250 ml'],
  ])}

  <h1>12 Technical data</h1>
  <h2>12.1 General</h2>
  ${table(['Property', 'Value'], [
    ['Ambient temperature', '0 to 45 °C'], ['Liquid temperature', '0 to 50 °C'], ['Storage temperature', '−20 to 60 °C'],
    ['Relative humidity', 'max. 90 %, non-condensing'], ['Degree of protection', 'IP65'], ['Weight', '4.8 kg (S) to 7.9 kg (XL)'],
    ['Sound pressure level', 'below 55 dB(A) at 1 m'], ['Housing', 'glass-fibre reinforced polypropylene'], ['Display', 'LCD, 128 × 64 pixels, backlit'],
  ])}
  <h2>12.2 Electrical data</h2>
  ${table(['Property', 'Value'], [
    ['Supply', '100–240 V AC, 50/60 Hz'], ['Power consumption', 'max. 150 W'], ['Controller fuse', 'T 2 A, 5 × 20 mm'],
    ['Alarm relay', '250 V AC, 2 A'], ['Analogue input', '0/4–20 mA, 250 Ω'], ['Pulse input', '5–30 V DC, max. 100 Hz'],
  ])}
  <h2>12.3 Tightening torques</h2>
  ${table(['Screw', 'Thread', 'Torque'], [
    ['Pump head cover screws', 'M5', '3.5 N·m'], ['Rotor fixing screw', 'M6', `${v.rotorTorque} N·m`], ['Gearbox flange screws', 'M5', '4.5 N·m'],
    ['Wall bracket screws', 'M6', '8.0 N·m'], ['Terminal box cover screws', 'M4', '1.5 N·m'], ['Hose connector union nuts', '—', 'hand-tight plus a quarter turn'],
  ])}
  ${P('Use a calibrated torque screwdriver. Do not use power tools on the plastic parts of the pump head.')}

  <h1>13 Decommissioning and disposal</h1>
  ${P('Before the pump is taken out of service for a long period, or sent for repair:')}
  ${OL([
    'Flush the pump with water or a suitable neutral liquid for at least five minutes.',
    'Relieve the pressure and empty the suction and discharge lines.',
    `Wear ${v.gloves} gloves and safety goggles when you remove the hose element.`,
    'Remove the hose element and store it in a dark, dry place.',
    'Fill in the decontamination declaration and attach it to the outside of the packaging.',
  ])}
  ${P('The pump contains electronic components and must not be disposed of with household waste. Return it to the manufacturer or to a collection point for electrical equipment. Hoses that have been in contact with chemicals are disposed of as hazardous waste.')}

  <h1>14 Maintenance record</h1>
  ${table(['Date', 'Work carried out', 'Hose run time (h)', 'Name'], Array.from({ length: 30 }, () => ['', '', '', '']), 'record')}
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
