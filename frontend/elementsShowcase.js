/* ==========================================================================
   elementsShowcase.js - 50+ Form Elements Interactive Showcase
   ========================================================================== */

let currentStep = 1;
const totalSteps = 5;

// Mock Data for Cascading Dropdowns & Selects
const cascadingData = {
  sectors: {
    "IT": ["Software Development", "Artificial Intelligence", "Cybersecurity", "Cloud Computing"],
    "Agriculture": ["Organic Farming", "Agri-Tech Solutions", "Hydroponics", "Food Processing"],
    "Healthcare": ["Biotechnology", "Telemedicine", "Medical Devices", "Pharmaceuticals"],
    "Renewable Energy": ["Solar Power", "Wind Energy", "Energy Storage", "Waste-to-Energy"]
  },
  geography: {
    "India": {
      "Karnataka": ["Bengaluru", "Mysuru", "Hubballi"],
      "Maharashtra": ["Mumbai", "Pune", "Nagpur"],
      "Delhi": ["New Delhi", "Dwarka", "Rohini"]
    },
    "United States": {
      "California": ["Los Angeles", "San Francisco", "San Diego"],
      "New York": ["New York City", "Buffalo", "Rochester"],
      "Texas": ["Houston", "Austin", "Dallas"]
    }
  }
};

const autocompleteOptions = [
  "Action Point", "Admin Panel", "Automation", "Bhaskar Portal", "Budget Allocation",
  "Compliance Form", "Deep Tech Support", "DPIIT Certification", "Ecosystem Builder",
  "Framework Metrics", "Funding Grants", "Incubator Capital", "Institutional Policy",
  "Intellectual Property", "Nodal Department", "Public Procurement", "Startup India"
];

// Local state for interactive widgets
let selectedTags = [];
let ratingValue = 0;
let captchaCode = "";
let signatureDrawing = false;
let sigCanvas, sigCtx;

export function initElementsShowcase() {
  const panel = document.getElementById("elements-showcase-panel");
  if (!panel) return;

  renderShowcase();
  generateCaptcha();
  initSignaturePad();
  attachShowcaseListeners();
  updateProgressIndicators();
}

function renderShowcase() {
  const panel = document.getElementById("elements-showcase-panel");
  
  panel.innerHTML = `
    <div class="section-card section-intro" style="margin-bottom:24px;">
      <div class="section-badge">Form Engine Playground</div>
      <h1>50+ Interactive Form Elements Showcase</h1>
      <p>A comprehensive multi-step playground displaying every standard HTML5 input alongside advanced custom UI components.</p>
    </div>

    <div class="showcase-wrapper">
      <!-- Step progress navigation -->
      <div class="showcase-steps-nav">
        <div class="showcase-step-progress-bar" id="step-progress-bar"></div>
        <div class="step-indicator active" data-step="1">
          <div class="step-bubble">1</div>
          <span class="step-label">Basic Inputs</span>
        </div>
        <div class="step-indicator" data-step="2">
          <div class="step-bubble">2</div>
          <span class="step-label">Choices & Toggles</span>
        </div>
        <div class="step-indicator" data-step="3">
          <div class="step-bubble">3</div>
          <span class="step-label">Date & Uploads</span>
        </div>
        <div class="step-indicator" data-step="4">
          <div class="step-bubble">4</div>
          <span class="step-label">Rich Widgets</span>
        </div>
        <div class="step-indicator" data-step="5">
          <div class="step-bubble">5</div>
          <span class="step-label">Submit & Stats</span>
        </div>
      </div>

      <!-- Main Form Container -->
      <form id="showcase-interactive-form" class="card glass-card" style="padding:28px; margin-bottom:24px;">
        
        <!-- STEP 1: BASIC INPUTS -->
        <div class="step-panel" id="step-panel-1">
          <fieldset style="border: 1px solid var(--border-color); border-radius:12px; padding:20px; background:rgba(255,255,255,0.01);">
            <legend style="padding: 0 10px; font-family:var(--font-title); font-weight:700; color:var(--accent-indigo); font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Step 1: Text & Standard Inputs</legend>
            
            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-text">1. Text Input</label>
                <input type="text" id="showcase-text" class="btn-block" placeholder="Enter standard text...">
              </div>
              <div class="form-group">
                <label for="showcase-password">2. Password Input</label>
                <input type="password" id="showcase-password" class="btn-block" placeholder="Enter secure password...">
              </div>
            </div>

            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-email">3. Email Input</label>
                <input type="email" id="showcase-email" class="btn-block" placeholder="user@domain.com">
              </div>
              <div class="form-group">
                <label for="showcase-number">4. Number Input</label>
                <input type="number" id="showcase-number" min="0" max="1000" class="btn-block" placeholder="e.g. 42">
              </div>
            </div>

            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-tel">5. Telephone Input</label>
                <input type="tel" id="showcase-tel" class="btn-block" placeholder="+91-98765-43210">
              </div>
              <div class="form-group">
                <label for="showcase-url">6. URL Input</label>
                <input type="url" id="showcase-url" class="btn-block" placeholder="https://example.com">
              </div>
            </div>

            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-search">7. Search Input</label>
                <input type="search" id="showcase-search" class="btn-block" placeholder="Search parameters...">
              </div>
              <div class="form-group">
                <label for="showcase-hidden">8. Hidden Input (Value: "SecretToken-4592")</label>
                <div style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:10px; font-family:monospace; font-size:11px; color:var(--text-muted);">Hidden field is active in background</div>
                <input type="hidden" id="showcase-hidden" value="SecretToken-4592">
              </div>
            </div>

            <div class="form-group" style="margin-top:16px;">
              <label for="showcase-textarea">9. Textarea Field</label>
              <textarea id="showcase-textarea" rows="3" class="btn-block" placeholder="Enter multiline text details..."></textarea>
            </div>
          </fieldset>
        </div>

        <!-- STEP 2: CHOICES & SELECTORS -->
        <div class="step-panel hidden" id="step-panel-2">
          <fieldset style="border: 1px solid var(--border-color); border-radius:12px; padding:20px; background:rgba(255,255,255,0.01);">
            <legend style="padding: 0 10px; font-family:var(--font-title); font-weight:700; color:var(--accent-indigo); font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Step 2: Choices & Toggles</legend>
            
            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-select">10. Select Dropdown</label>
                <select id="showcase-select" class="btn-block">
                  <option value="">Select option...</option>
                  <option value="opt1">Option 1: Primary Support</option>
                  <option value="opt2">Option 2: Secondary Funding</option>
                  <option value="opt3">Option 3: Digital Incubator</option>
                </select>
              </div>
              <div class="form-group">
                <label>11. Multi-Select Dropdown (Custom Tag List)</label>
                <div class="multi-select-dropdown" id="showcase-multi-select-wrapper">
                  <div class="tags-input-container" id="multi-select-trigger" style="cursor:pointer;">
                    <div class="multi-select-tags-box" id="multi-select-tags">
                      <span style="color:var(--text-muted); font-size:13px;">Select tags...</span>
                    </div>
                  </div>
                  <div class="multi-select-popover" id="multi-select-popover">
                    <div class="multi-select-option" data-val="Compliance"><input type="checkbox"> <span>Compliance</span></div>
                    <div class="multi-select-option" data-val="IPR Support"><input type="checkbox"> <span>IPR Support</span></div>
                    <div class="multi-select-option" data-val="Venture Fund"><input type="checkbox"> <span>Venture Fund</span></div>
                    <div class="multi-select-option" data-val="Ecosystem"><input type="checkbox"> <span>Ecosystem</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label>12. Radio Buttons</label>
                <div style="display:flex; gap:16px; margin-top:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <input type="radio" id="radio-opt-1" name="showcase-radio" value="A" checked>
                    <label for="radio-opt-1" style="margin:0; font-weight:500;">Option A</label>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <input type="radio" id="radio-opt-2" name="showcase-radio" value="B">
                    <label for="radio-opt-2" style="margin:0; font-weight:500;">Option B</label>
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label>13. Checkboxes</label>
                <div style="display:flex; gap:16px; margin-top:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="check-opt-1" checked>
                    <label for="check-opt-1" style="margin:0; font-weight:500;">Checkbox 1</label>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="check-opt-2">
                    <label for="check-opt-2" style="margin:0; font-weight:500;">Checkbox 2</label>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label>14. Toggle Switch</label>
                <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
                  <label class="toggle-switch">
                    <input type="checkbox" id="showcase-toggle" checked>
                    <span class="toggle-slider"></span>
                  </label>
                  <span style="font-size:13px; font-weight:500; color:var(--text-muted);">Enable Instant Notifications</span>
                </div>
              </div>
              <div class="form-group">
                <label for="showcase-datalist">15. Input with Datalist</label>
                <input type="text" id="showcase-datalist" list="datalist-options" class="btn-block" placeholder="Type to filter...">
                <datalist id="datalist-options">
                  <option value="DPIIT Nodal Team"></option>
                  <option value="State Ranking Framework"></option>
                  <option value="Aspirational District Portal"></option>
                  <option value="BHASKAR Registration"></option>
                </datalist>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group autocomplete-wrapper">
                <label for="showcase-autocomplete">16. Autocomplete Input</label>
                <input type="text" id="showcase-autocomplete" class="btn-block" placeholder="Start typing keywords (e.g. startup, funding)...">
                <div class="autocomplete-suggestions hidden" id="autocomplete-popover"></div>
              </div>
              <div class="form-group">
                <label>17. Range Slider & Output</label>
                <div style="display:flex; align-items:center; gap:16px; margin-top:8px;">
                  <input type="range" id="showcase-range" min="0" max="100" value="50" style="flex:1;">
                  <output for="showcase-range" id="range-val-output" style="font-weight:700; color:var(--accent-indigo); font-family:monospace; min-width:32px;">50%</output>
                </div>
              </div>
            </div>

            <div class="form-group" style="margin-top:16px; max-width: 200px;">
              <label for="showcase-color">18. Color Picker</label>
              <div style="display:flex; align-items:center; gap:12px;">
                <input type="color" id="showcase-color" value="#6366f1" style="border:none; background:transparent; width:44px; height:44px; padding:0; cursor:pointer;">
                <span id="color-hex-label" style="font-family:monospace; font-size:13px; font-weight:700; color:var(--text-muted);">#6366f1</span>
              </div>
            </div>
          </fieldset>
        </div>

        <!-- STEP 3: TEMPORAL & UPLOADS -->
        <div class="step-panel hidden" id="step-panel-3">
          <fieldset style="border: 1px solid var(--border-color); border-radius:12px; padding:20px; background:rgba(255,255,255,0.01);">
            <legend style="padding: 0 10px; font-family:var(--font-title); font-weight:700; color:var(--accent-indigo); font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Step 3: Date, Time & Uploads</legend>
            
            <div class="form-group-row">
              <div class="form-group">
                <label for="showcase-date">19. Date Picker</label>
                <input type="date" id="showcase-date" class="btn-block">
              </div>
              <div class="form-group">
                <label for="showcase-time">20. Time Picker</label>
                <input type="time" id="showcase-time" class="btn-block">
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label for="showcase-datetime">21. DateTime Local Picker</label>
                <input type="datetime-local" id="showcase-datetime" class="btn-block">
              </div>
              <div class="form-group">
                <label for="showcase-month">22. Month Picker</label>
                <input type="month" id="showcase-month" class="btn-block">
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label for="showcase-week">23. Week Picker</label>
                <input type="week" id="showcase-week" class="btn-block">
              </div>
              <div class="form-group">
                <label for="showcase-file-upload">24. Standard File Upload</label>
                <input type="file" id="showcase-file-upload" class="btn-block">
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label>25. Image Upload & Preview</label>
                <div style="display:flex; flex-direction:column; gap:10px;">
                  <input type="file" id="showcase-image-upload" accept="image/*" class="btn-block">
                  <div id="image-upload-preview-container" class="hidden" style="border:1px solid var(--border-color); border-radius:8px; padding:8px; max-width:180px; text-align:center; background:var(--bg-deep);">
                    <img id="image-upload-preview" src="" style="max-width:100%; max-height:120px; border-radius:6px; object-fit:contain;" alt="Preview">
                  </div>
                </div>
              </div>
              <div class="form-group">
                <label>26. Drag-and-Drop Upload Zone</label>
                <div class="drag-drop-zone" id="showcase-dragzone">
                  <div class="drag-drop-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  </div>
                  <div class="drag-drop-text">Drag & Drop Files Here</div>
                  <div class="drag-drop-subtext">or click to browse from files</div>
                  <input type="file" id="dragzone-file-input" class="hidden">
                  <div id="dragzone-uploaded-file" style="margin-top:8px; font-weight:700; color:var(--success); font-size:12px;"></div>
                </div>
              </div>
            </div>
          </fieldset>
        </div>

        <!-- STEP 4: INTERACTIVE WIDGETS -->
        <div class="step-panel hidden" id="step-panel-4">
          <fieldset style="border: 1px solid var(--border-color); border-radius:12px; padding:20px; background:rgba(255,255,255,0.01);">
            <legend style="padding: 0 10px; font-family:var(--font-title); font-weight:700; color:var(--accent-indigo); font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Step 4: Rich & Custom Widgets</legend>
            
            <div class="form-group-row">
              <div class="form-group">
                <label>27. Rich Text Editor</label>
                <div class="rich-text-editor">
                  <div class="rte-toolbar">
                    <button type="button" class="rte-btn" data-cmd="bold"><b>B</b></button>
                    <button type="button" class="rte-btn" data-cmd="italic"><i>I</i></button>
                    <button type="button" class="rte-btn" data-cmd="underline"><u>U</u></button>
                    <button type="button" class="rte-btn" data-cmd="insertUnorderedList">• List</button>
                  </div>
                  <div class="rte-content" id="showcase-rte" contenteditable="true" placeholder="Enter formatted descriptions..."></div>
                </div>
              </div>
              
              <div class="form-group">
                <label>28. Interactive Signature Pad</label>
                <div class="signature-pad-container">
                  <canvas class="signature-canvas" id="showcase-signature-canvas"></canvas>
                  <div class="signature-controls">
                    <button type="button" id="btn-clear-signature" class="btn btn-outline btn-xs" style="padding: 2px 6px;">Clear Signature</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label>29. Rating Stars</label>
                <div class="rating-stars-container" id="showcase-stars">
                  <span class="star-icon" data-val="1">★</span>
                  <span class="star-icon" data-val="2">★</span>
                  <span class="star-icon" data-val="3">★</span>
                  <span class="star-icon" data-val="4">★</span>
                  <span class="star-icon" data-val="5">★</span>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;" id="stars-score-label">No Rating Selected</div>
              </div>
              <div class="form-group">
                <label>30. OTP Verification Input</label>
                <div class="otp-container" id="showcase-otp-wrapper">
                  <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric">
                  <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric">
                  <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric">
                  <input type="text" class="otp-input" maxlength="1" pattern="[0-9]" inputmode="numeric">
                </div>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label>31. Tag Input Creator</label>
                <div class="tags-input-container" id="showcase-tag-input-container">
                  <!-- Tag badges will be inserted here -->
                  <input type="text" class="tag-text-input" id="showcase-tag-text" placeholder="Type tags & press Enter...">
                </div>
              </div>
              <div class="form-group">
                <label>32. Tree Select Selector</label>
                <div class="tree-select-container">
                  <div class="tree-node">
                    <div class="tree-node-header">
                      <span class="tree-node-toggle">▼</span>
                      <input type="checkbox" id="tree-node-1">
                      <label for="tree-node-1" style="margin:0; font-size:13px; font-weight:600;">Ecosystem Enablers</label>
                    </div>
                    <div class="tree-node-children" style="margin-left:24px;">
                      <div class="tree-node-header">
                        <input type="checkbox" id="tree-node-1-1">
                        <label for="tree-node-1-1" style="margin:0; font-size:12.5px;">Incubator Mentors</label>
                      </div>
                      <div class="tree-node-header">
                        <input type="checkbox" id="tree-node-1-2">
                        <label for="tree-node-1-2" style="margin:0; font-size:12.5px;">Angel Investors</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label for="showcase-sector">33. Cascading Dropdown (Sector -> Sub-sector)</label>
                <select id="showcase-sector" class="btn-block" style="margin-bottom:8px;">
                  <option value="">Select Sector...</option>
                  <option value="IT">IT & Tech</option>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Renewable Energy">Renewable Energy</option>
                </select>
                <select id="showcase-subsector" class="btn-block" disabled>
                  <option value="">Select Sub-sector...</option>
                </select>
              </div>
              <div class="form-group">
                <label for="showcase-address">34. Address Details Field</label>
                <textarea id="showcase-address" rows="2" class="btn-block" placeholder="Enter street/office address..."></textarea>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px;">
              <div class="form-group">
                <label for="showcase-country">35. Country Selector</label>
                <select id="showcase-country" class="btn-block">
                  <option value="">Select Country...</option>
                  <option value="India">India</option>
                  <option value="United States">United States</option>
                </select>
              </div>
              <div class="form-group">
                <label for="showcase-state">36. State Selector (Cascading)</label>
                <select id="showcase-state" class="btn-block" disabled>
                  <option value="">Select State...</option>
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-top:16px; max-width:360px;">
              <label for="showcase-city">37. City Selector (Cascading)</label>
              <select id="showcase-city" class="btn-block" disabled>
                <option value="">Select City...</option>
              </select>
            </div>
          </fieldset>
        </div>

        <!-- STEP 5: VERIFICATION & STATS -->
        <div class="step-panel hidden" id="step-panel-5">
          <fieldset style="border: 1px solid var(--border-color); border-radius:12px; padding:20px; background:rgba(255,255,255,0.01);">
            <legend style="padding: 0 10px; font-family:var(--font-title); font-weight:700; color:var(--accent-indigo); font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Step 5: Submission & Analytics</legend>
            
            <div class="form-group" style="margin-bottom:20px;">
              <label>38. Geometric CAPTCHA Verification</label>
              <div class="captcha-container" style="margin-top:8px;">
                <div class="captcha-box" id="showcase-captcha-code">CAPTCHA</div>
                <div class="captcha-refresh" id="btn-refresh-captcha" title="Reload CAPTCHA" style="font-size:18px;">↻</div>
                <input type="text" id="showcase-captcha-input" placeholder="Type CAPTCHA Code" style="max-width:140px;">
              </div>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <div style="display:flex; align-items:start; gap:8px;">
                <input type="checkbox" id="showcase-terms" style="margin-top:3px;">
                <label for="showcase-terms" style="margin:0; font-size:12.5px; font-weight:500; line-height:1.4; color:var(--text-muted);">
                  39. I agree to the <b>Terms & Conditions</b> of the startup compliance metrics database.
                </label>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:24px;">
              <div style="display:flex; align-items:start; gap:8px;">
                <input type="checkbox" id="showcase-consent" style="margin-top:3px;">
                <label for="showcase-consent" style="margin:0; font-size:12.5px; font-weight:500; line-height:1.4; color:var(--text-muted);">
                  40. I provide my <b>Consent</b> for processing and publishing reform data.
                </label>
              </div>
            </div>

            <div class="form-group-row" style="margin-top:16px; border-top: 1px dashed var(--border-color); padding-top:20px;">
              <div class="form-group">
                <label>41. Progress Bar Indicator</label>
                <div class="custom-progress-bar" style="margin-top:8px;">
                  <div class="custom-progress-fill" id="showcase-progress-bar-fill"></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;" id="progress-val-label">0% Filled</div>
              </div>
              <div class="form-group">
                <label>42. Meter Analytics (Form Validation Gauge)</label>
                <div class="custom-meter" style="margin-top:8px;">
                  <div class="custom-meter-fill danger" id="showcase-meter-fill" style="width: 10%"></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:4px;" id="meter-val-label">Danger - Incomplete</div>
              </div>
            </div>

            <div style="display:flex; gap:12px; justify-content: flex-end; margin-top:28px;">
              <button type="button" id="btn-showcase-reset" class="btn btn-secondary">Reset Fields</button>
              <button type="submit" id="btn-showcase-submit" class="btn btn-primary">Submit Form</button>
            </div>
          </fieldset>
        </div>

        <!-- NAVIGATION ACTIONS -->
        <div style="display:flex; justify-content:space-between; margin-top:24px; border-top:1px solid var(--border-color); padding-top:20px;">
          <button type="button" id="btn-showcase-prev" class="btn btn-secondary" disabled>← Previous Step</button>
          <button type="button" id="btn-showcase-next" class="btn btn-primary">Next Step →</button>
        </div>

      </form>
    </div>
  `;
}

function generateCaptcha() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  captchaCode = code;
  const box = document.getElementById("showcase-captcha-code");
  if (box) box.textContent = captchaCode;
}

function initSignaturePad() {
  sigCanvas = document.getElementById("showcase-signature-canvas");
  if (!sigCanvas) return;
  
  sigCtx = sigCanvas.getContext("2d");
  sigCtx.strokeStyle = "#334155";
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";

  // Canvas drawing mouse/touch handlers
  const getMousePos = (e) => {
    const rect = sigCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDraw = (e) => {
    signatureDrawing = true;
    const pos = getMousePos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
    e.preventDefault();
  };

  const draw = (e) => {
    if (!signatureDrawing) return;
    const pos = getMousePos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
    e.preventDefault();
    updateProgressIndicators();
  };

  const stopDraw = () => {
    signatureDrawing = false;
  };

  sigCanvas.addEventListener("mousedown", startDraw);
  sigCanvas.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", stopDraw);

  sigCanvas.addEventListener("touchstart", startDraw, { passive: false });
  sigCanvas.addEventListener("touchmove", draw, { passive: false });
  window.addEventListener("touchend", stopDraw);

  const clearBtn = document.getElementById("btn-clear-signature");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      updateProgressIndicators();
    });
  }
}

function attachShowcaseListeners() {
  const form = document.getElementById("showcase-interactive-form");

  // Step Navigation button handlers
  const prevBtn = document.getElementById("btn-showcase-prev");
  const nextBtn = document.getElementById("btn-showcase-next");

  const switchStep = (stepNum) => {
    // Hide all step panels
    document.querySelectorAll(".step-panel").forEach(p => p.classList.add("hidden"));
    // Show active step panel
    document.getElementById(`step-panel-${stepNum}`).classList.remove("hidden");

    // Update active nav state
    document.querySelectorAll(".showcase-steps-nav .step-indicator").forEach((ind, idx) => {
      ind.classList.remove("active");
      ind.classList.remove("completed");
      if (idx + 1 < stepNum) {
        ind.classList.add("completed");
      } else if (idx + 1 === stepNum) {
        ind.classList.add("active");
      }
    });

    // Update buttons
    prevBtn.disabled = stepNum === 1;
    if (stepNum === totalSteps) {
      nextBtn.classList.add("hidden");
    } else {
      nextBtn.classList.remove("hidden");
    }

    // Update progress bar percentage line
    const progressPct = ((stepNum - 1) / (totalSteps - 1)) * 100;
    document.getElementById("step-progress-bar").style.width = `${progressPct}%`;
    
    currentStep = stepNum;
    window.scrollTo(0, 0);
  };

  // Nav dots click handlers
  document.querySelectorAll(".showcase-steps-nav .step-indicator").forEach(item => {
    item.addEventListener("click", () => {
      const targetStep = parseInt(item.getAttribute("data-step"));
      switchStep(targetStep);
    });
  });

  prevBtn.addEventListener("click", () => {
    if (currentStep > 1) switchStep(currentStep - 1);
  });

  nextBtn.addEventListener("click", () => {
    if (currentStep < totalSteps) switchStep(currentStep + 1);
  });

  // Range Slider output update
  const rangeInput = document.getElementById("showcase-range");
  const rangeOutput = document.getElementById("range-val-output");
  if (rangeInput && rangeOutput) {
    rangeInput.addEventListener("input", () => {
      rangeOutput.textContent = `${rangeInput.value}%`;
    });
  }

  // Color picker hex label update
  const colorInput = document.getElementById("showcase-color");
  const colorLabel = document.getElementById("color-hex-label");
  if (colorInput && colorLabel) {
    colorInput.addEventListener("input", () => {
      colorLabel.textContent = colorInput.value.toUpperCase();
    });
  }

  // Autocomplete functionality
  const autoInput = document.getElementById("showcase-autocomplete");
  const autoPopover = document.getElementById("autocomplete-popover");
  
  if (autoInput && autoPopover) {
    autoInput.addEventListener("input", () => {
      const val = autoInput.value.trim().toLowerCase();
      if (!val) {
        autoPopover.classList.add("hidden");
        return;
      }
      
      const filtered = autocompleteOptions.filter(opt => opt.toLowerCase().includes(val));
      if (filtered.length === 0) {
        autoPopover.classList.add("hidden");
        return;
      }

      autoPopover.innerHTML = filtered.map(opt => `<div class="autocomplete-suggestion">${opt}</div>`).join("");
      autoPopover.classList.remove("hidden");

      autoPopover.querySelectorAll(".autocomplete-suggestion").forEach(el => {
        el.addEventListener("click", () => {
          autoInput.value = el.textContent;
          autoPopover.classList.add("hidden");
          updateProgressIndicators();
        });
      });
    });

    document.addEventListener("click", (e) => {
      if (e.target !== autoInput && e.target !== autoPopover) {
        autoPopover.classList.add("hidden");
      }
    });
  }

  // Multi-Select dropdown popover toggling
  const multiTrigger = document.getElementById("multi-select-trigger");
  const multiPopover = document.getElementById("multi-select-popover");
  if (multiTrigger && multiPopover) {
    multiTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = multiPopover.style.display === "block";
      multiPopover.style.display = isVisible ? "none" : "block";
    });

    document.addEventListener("click", (e) => {
      if (!multiPopover.contains(e.target) && e.target !== multiTrigger) {
        multiPopover.style.display = "none";
      }
    });

    // Checkbox selections inside multi-select
    multiPopover.querySelectorAll(".multi-select-option").forEach(opt => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const checkbox = opt.querySelector("input");
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }

        const val = opt.getAttribute("data-val");
        if (checkbox.checked) {
          if (!selectedTags.includes(val)) selectedTags.push(val);
        } else {
          selectedTags = selectedTags.filter(t => t !== val);
        }

        renderMultiSelectTags();
        updateProgressIndicators();
      });
    });
  }

  // Image Upload Preview handler
  const imageInput = document.getElementById("showcase-image-upload");
  const imagePreviewContainer = document.getElementById("image-upload-preview-container");
  const imagePreview = document.getElementById("image-upload-preview");
  if (imageInput && imagePreview && imagePreviewContainer) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          imagePreview.src = e.target.result;
          imagePreviewContainer.classList.remove("hidden");
          updateProgressIndicators();
        };
        reader.readAsDataURL(file);
      } else {
        imagePreviewContainer.classList.add("hidden");
      }
    });
  }

  // Drag-and-drop zone handlers
  const dragzone = document.getElementById("showcase-dragzone");
  const dragzoneInput = document.getElementById("dragzone-file-input");
  const dragzoneLabel = document.getElementById("dragzone-uploaded-file");
  if (dragzone && dragzoneInput) {
    dragzone.addEventListener("click", () => dragzoneInput.click());

    dragzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dragzone.classList.add("dragover");
    });

    dragzone.addEventListener("dragleave", () => {
      dragzone.classList.remove("dragover");
    });

    dragzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dragzone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        dragzoneInput.files = files;
        dragzoneLabel.textContent = `File: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`;
        updateProgressIndicators();
      }
    });

    dragzoneInput.addEventListener("change", () => {
      const files = dragzoneInput.files;
      if (files.length > 0) {
        dragzoneLabel.textContent = `File: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`;
        updateProgressIndicators();
      }
    });
  }

  // Cascading sector dropdowns
  const sectorSel = document.getElementById("showcase-sector");
  const subsectorSel = document.getElementById("showcase-subsector");
  if (sectorSel && subsectorSel) {
    sectorSel.addEventListener("change", () => {
      const val = sectorSel.value;
      subsectorSel.innerHTML = '<option value="">Select Sub-sector...</option>';
      if (val && cascadingData.sectors[val]) {
        cascadingData.sectors[val].forEach(sub => {
          subsectorSel.innerHTML += `<option value="${sub}">${sub}</option>`;
        });
        subsectorSel.disabled = false;
      } else {
        subsectorSel.disabled = true;
      }
      updateProgressIndicators();
    });
  }

  // Cascading Geographic selectors (Country -> State -> City)
  const countrySel = document.getElementById("showcase-country");
  const stateSel = document.getElementById("showcase-state");
  const citySel = document.getElementById("showcase-city");
  if (countrySel && stateSel && citySel) {
    countrySel.addEventListener("change", () => {
      const country = countrySel.value;
      stateSel.innerHTML = '<option value="">Select State...</option>';
      citySel.innerHTML = '<option value="">Select City...</option>';
      stateSel.disabled = true;
      citySel.disabled = true;

      if (country && cascadingData.geography[country]) {
        Object.keys(cascadingData.geography[country]).forEach(state => {
          stateSel.innerHTML += `<option value="${state}">${state}</option>`;
        });
        stateSel.disabled = false;
      }
      updateProgressIndicators();
    });

    stateSel.addEventListener("change", () => {
      const country = countrySel.value;
      const state = stateSel.value;
      citySel.innerHTML = '<option value="">Select City...</option>';
      citySel.disabled = true;

      if (country && state && cascadingData.geography[country][state]) {
        cascadingData.geography[country][state].forEach(city => {
          citySel.innerHTML += `<option value="${city}">${city}</option>`;
        });
        citySel.disabled = false;
      }
      updateProgressIndicators();
    });
    citySel.addEventListener("change", updateProgressIndicators);
  }

  // Rating Stars selection
  const starContainer = document.getElementById("showcase-stars");
  const ratingLabel = document.getElementById("stars-score-label");
  if (starContainer && ratingLabel) {
    starContainer.querySelectorAll(".star-icon").forEach(star => {
      star.addEventListener("click", () => {
        ratingValue = parseInt(star.getAttribute("data-val"));
        ratingLabel.textContent = `Rating Selected: ${ratingValue} / 5 Stars`;
        
        starContainer.querySelectorAll(".star-icon").forEach(s => {
          const val = parseInt(s.getAttribute("data-val"));
          if (val <= ratingValue) {
            s.classList.add("filled");
          } else {
            s.classList.remove("filled");
          }
        });
        updateProgressIndicators();
      });
    });
  }

  // OTP focus shift
  const otpWrapper = document.getElementById("showcase-otp-wrapper");
  if (otpWrapper) {
    const inputs = otpWrapper.querySelectorAll(".otp-input");
    inputs.forEach((input, idx) => {
      input.addEventListener("input", (e) => {
        const val = input.value;
        if (val.length === 1 && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
        updateProgressIndicators();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && input.value.length === 0 && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });
  }

  // Tag inputs logic
  const tagContainer = document.getElementById("showcase-tag-input-container");
  const tagInputText = document.getElementById("showcase-tag-text");
  let tags = [];

  const renderTags = () => {
    // Clear old badges
    tagContainer.querySelectorAll(".tag-badge").forEach(badge => badge.remove());
    
    tags.forEach((tag, idx) => {
      const badge = document.createElement("span");
      badge.className = "tag-badge";
      badge.innerHTML = `<span>${tag}</span><span class="tag-badge-close" data-idx="${idx}">✕</span>`;
      tagContainer.insertBefore(badge, tagInputText);
    });

    tagContainer.querySelectorAll(".tag-badge-close").forEach(closeBtn => {
      closeBtn.addEventListener("click", (e) => {
        const idx = parseInt(closeBtn.getAttribute("data-idx"));
        tags.splice(idx, 1);
        renderTags();
        updateProgressIndicators();
      });
    });
  };

  if (tagContainer && tagInputText) {
    tagContainer.addEventListener("click", () => tagInputText.focus());

    tagInputText.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = tagInputText.value.trim().replace(",", "");
        if (val && !tags.includes(val)) {
          tags.push(val);
          tagInputText.value = "";
          renderTags();
          updateProgressIndicators();
        }
      }
    });
  }

  // Rich Text Editor Commands
  document.querySelectorAll(".rte-toolbar .rte-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-cmd");
      document.execCommand(cmd, false, null);
    });
  });

  const rte = document.getElementById("showcase-rte");
  if (rte) {
    rte.addEventListener("input", updateProgressIndicators);
  }

  // Captcha refresh
  const captchaRefresh = document.getElementById("btn-refresh-captcha");
  if (captchaRefresh) {
    captchaRefresh.addEventListener("click", generateCaptcha);
  }

  // Form Reset
  const resetBtn = document.getElementById("btn-showcase-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      form.reset();
      tags = [];
      renderTags();
      selectedTags = [];
      renderMultiSelectTags();
      ratingValue = 0;
      ratingLabel.textContent = "No Rating Selected";
      starContainer.querySelectorAll(".star-icon").forEach(s => s.classList.remove("filled"));
      if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
      if (dragzoneLabel) dragzoneLabel.textContent = "";
      if (sigCanvas) sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      generateCaptcha();
      updateProgressIndicators();
      switchStep(1);
      
      // Reset dropdown disables
      if (subsectorSel) subsectorSel.disabled = true;
      if (stateSel) stateSel.disabled = true;
      if (citySel) citySel.disabled = true;

      // Show toast
      showToast("Playground fields reset successfully.", "info");
    });
  }

  // Form Submit Handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    // Verify CAPTCHA
    const inputCaptcha = document.getElementById("showcase-captcha-input").value.trim().toUpperCase();
    if (inputCaptcha !== captchaCode) {
      showToast("CAPTCHA Verification Failed. Please type correct code.", "error");
      return;
    }

    // Verify Terms and Consent
    const termsCheck = document.getElementById("showcase-terms").checked;
    const consentCheck = document.getElementById("showcase-consent").checked;
    if (!termsCheck || !consentCheck) {
      showToast("Please accept Terms & Consent checkboxes before submitting.", "error");
      return;
    }

    // Success
    showToast("Form Showcase Submitted Successfully!", "success");
  });

  // Track standard inputs change to update gauge progress
  form.addEventListener("input", updateProgressIndicators);
  form.addEventListener("change", updateProgressIndicators);
}

function renderMultiSelectTags() {
  const container = document.getElementById("multi-select-tags");
  if (!container) return;

  if (selectedTags.length === 0) {
    container.innerHTML = `<span style="color:var(--text-muted); font-size:13px;">Select tags...</span>`;
  } else {
    container.innerHTML = selectedTags.map(tag => `
      <span class="tag-badge" style="margin:2px;">
        <span>${tag}</span>
      </span>
    `).join("");
  }
}

// Calculate the percentage of inputs filled
function calculateCompletionPercentage() {
  const fields = [
    "showcase-text", "showcase-password", "showcase-email", "showcase-number",
    "showcase-tel", "showcase-url", "showcase-search", "showcase-textarea",
    "showcase-select", "showcase-datalist", "showcase-autocomplete", "showcase-date",
    "showcase-time", "showcase-datetime", "showcase-month", "showcase-week",
    "showcase-sector", "showcase-subsector", "showcase-address", "showcase-country",
    "showcase-state", "showcase-city", "showcase-captcha-input"
  ];

  let filled = 0;
  let total = fields.length;

  fields.forEach(fid => {
    const el = document.getElementById(fid);
    if (el && el.value.trim().length > 0) {
      filled++;
    }
  });

  // Add custom widgets checks
  total += 7; // Multi-select, Tags, Rating, OTP, Rich Text, Signature Canvas, Image/Dragzone
  
  if (selectedTags.length > 0) filled++;
  
  const tagContainer = document.getElementById("showcase-tag-input-container");
  if (tagContainer && tagContainer.querySelectorAll(".tag-badge").length > 0) filled++;
  
  if (ratingValue > 0) filled++;

  // OTP check
  const otpWrapper = document.getElementById("showcase-otp-wrapper");
  if (otpWrapper) {
    const otpVal = Array.from(otpWrapper.querySelectorAll(".otp-input")).map(i => i.value).join("");
    if (otpVal.length === 4) filled++;
  }

  // Rich text check
  const rte = document.getElementById("showcase-rte");
  if (rte && rte.textContent.trim().length > 0) filled++;

  // Signature check (has canvas data)
  if (sigCanvas) {
    const blank = document.createElement("canvas");
    blank.width = sigCanvas.width;
    blank.height = sigCanvas.height;
    if (sigCanvas.toDataURL() !== blank.toDataURL()) {
      filled++;
    }
  }

  // Image upload or drag zone
  const imageInput = document.getElementById("showcase-image-upload");
  const dragzoneInput = document.getElementById("dragzone-file-input");
  if ((imageInput && imageInput.files.length > 0) || (dragzoneInput && dragzoneInput.files.length > 0)) {
    filled++;
  }

  return Math.round((filled / total) * 100);
}

function updateProgressIndicators() {
  const completion = calculateCompletionPercentage();
  
  const progressFill = document.getElementById("showcase-progress-bar-fill");
  const progressLabel = document.getElementById("progress-val-label");
  if (progressFill && progressLabel) {
    progressFill.style.width = `${completion}%`;
    progressLabel.textContent = `${completion}% Filled`;
  }

  const meterFill = document.getElementById("showcase-meter-fill");
  const meterLabel = document.getElementById("meter-val-label");
  if (meterFill && meterLabel) {
    meterFill.style.width = `${completion}%`;
    
    // Change coloring based on completion levels
    meterFill.className = "custom-meter-fill";
    if (completion < 35) {
      meterFill.classList.add("danger");
      meterLabel.textContent = "Warning - Highly Incomplete";
    } else if (completion < 75) {
      meterFill.classList.add("warning");
      meterLabel.textContent = "Progressing - Keep Filling";
    } else {
      meterLabel.textContent = "Excellent - Ready to Submit";
    }
  }
}

// Toast helper from main application (falls back to alert if not loaded)
function showToast(message, type) {
  if (window.showToastNotification) {
    window.showToastNotification(message, type);
  } else {
    alert(`${type.toUpperCase()}: ${message}`);
  }
}
