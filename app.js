
const CONFIG = window.APP_CONFIG || {};
const STORAGE_BUCKET = "restaurant-photos";
let supabase = null;
if (window.supabase && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
  supabase = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
}

let reviews = [];
let currentStep = 1;
let currentPhotoFile = null;
let activeDetailId = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function round1(n){ return Math.round(n * 10) / 10; }
function escapeHtml(str=""){ return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m])); }

function calcScore(data){
  const weights = {drive:.04, parking:.04, wait:.06, welcome:.06, warmth:.07, timing:.07, accuracy:.08, food:.19, freshness:.12, atmosphere:.09, noise:.05, value:.07, craving:.16};
  let score =
    (+data.drive||0)*weights.drive + (+data.parking||0)*weights.parking + (+data.wait||0)*weights.wait +
    (+data.welcome||0)*weights.welcome + (+data.warmth||0)*weights.warmth + (+data.timing||0)*weights.timing +
    (+data.accuracy||0)*weights.accuracy + (+data.food||0)*weights.food + (+data.freshness||0)*weights.freshness +
    (+data.atmosphere||0)*weights.atmosphere + (+data.noise||0)*weights.noise + (+data.value||0)*weights.value +
    (+data.craving||0)*weights.craving;

  if (data.recommend === "yes") score += 0.2;
  if (data.recommend === "no") score -= 0.4;
  if (data.chooseAgain === "yes") score += 0.15;
  if (data.chooseAgain === "no") score -= 0.25;
  if (data.moment === "celebration") score += 0.05;

  const venueBoost = {
    sushi: ((+data.food||0) >= 9 && (+data.freshness||0) >= 9) ? 0.15 : 0,
    cafe: ((+data.atmosphere||0) >= 9) ? 0.10 : 0,
    bar: ((+data.atmosphere||0) >= 9 && (+data.noise||0) >= 8) ? 0.10 : 0,
    dessert: ((+data.food||0) >= 9) ? 0.10 : 0,
    restaurant: 0
  };
  score += venueBoost[data.venueType] || 0;
  return round1(clamp(score,1,10));
}

function starText(score){
  const full = Math.round(score);
  return "★".repeat(full) + "☆".repeat(10-full);
}

function verdictFor(score){
  if(score >= 9.6) return "Main Character Meal";
  if(score >= 9.0) return "Tal Certified";
  if(score >= 8.4) return "Would Book Again";
  if(score >= 7.5) return "Cute But Flawed";
  if(score >= 6.5) return "Only If Nearby";
  return "Not Worth the Outfit";
}

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 1800);
}

function setStep(step){
  currentStep = step;
  $$(".form-step").forEach(el=>el.classList.toggle("active", +el.dataset.step === step));
  $$("[data-step-dot]").forEach(el=>el.classList.toggle("active", +el.dataset.stepDot <= step));
  $("#backBtn").classList.toggle("hidden", step === 1);
  $("#nextBtn").classList.toggle("hidden", step === 3);
  $("#saveBtn").classList.toggle("hidden", step !== 3);
  if(step === 3) updatePreview();
}

function openReview(){
  $("#reviewForm").reset();
  $("#reviewForm").querySelector('[name="date"]').value = new Date().toISOString().slice(0,10);
  ["drive","parking","wait","welcome","warmth","timing","accuracy","food","freshness","atmosphere","noise","value","craving"].forEach(name=>{
    $("#reviewForm").elements[name].value = 8;
    const out = document.getElementById(name + "Out");
    if(out) out.textContent = 8;
  });
  currentPhotoFile = null;
  $("#photoPreview").classList.add("hidden");
  $("#photoPreview").src = "";
  $("#photoStatus").textContent = "Take or upload one photo of the restaurant or food.";
  setStep(1);
  $("#reviewModal").classList.add("open");
}
function closeReview(){ $("#reviewModal").classList.remove("open"); }
function closeDetail(){ $("#detailModal").classList.remove("open"); }

function formData(){
  return Object.fromEntries(new FormData($("#reviewForm")).entries());
}

function validateStepOne(){
  const f = $("#reviewForm");
  for(const name of ["name","cuisine","area","tag"]){
    if(!f.elements[name].value.trim()){
      f.elements[name].focus();
      toast("Please complete the basic details");
      return false;
    }
  }
  if(!currentPhotoFile){
    toast("A restaurant photo is required");
    return false;
  }
  return true;
}

function updatePreview(){
  const data = formData();
  const score = calcScore(data);
  $("#scorePreview").textContent = score.toFixed(1);
  $("#starPreview").textContent = starText(score);
  $("#verdictPreview").textContent = verdictFor(score);
}

function criticProgress(){
  const n = reviews.length;
  const levels = [
    {name:"Baby Critic", min:0, next:3},
    {name:"Hot Girl Foodie", min:3, next:8},
    {name:"Pink Tastemaker", min:8, next:15},
    {name:"Reservation Royalty", min:15, next:25},
    {name:"Tal the Critic", min:25, next:null}
  ];
  let level = levels[0];
  for(const l of levels){ if(n >= l.min) level = l; }

  let pct = 100, hint = "Top level unlocked.";
  if(level.next){
    pct = ((n - level.min) / (level.next - level.min)) * 100;
    hint = n ? `${level.next - n} more review${level.next - n === 1 ? "" : "s"} to reach the next level.` : "Your first review unlocks the game.";
  }

  $("#criticLevel").textContent = level.name;
  $("#criticXP").textContent = n * 100;
  $("#levelBar").style.width = `${clamp(pct,0,100)}%`;
  $("#levelHint").textContent = hint;

  const badges = [
    {name:"First Bite", on:n >= 1},
    {name:"Sushi Sweetheart", on:reviews.filter(r=>r.venue_type === "sushi").length >= 3},
    {name:"Worth The Drive", on:reviews.filter(r=>+r.drive >= 8).length >= 4},
    {name:"Girls Night Scout", on:reviews.filter(r=>r.tag === "girls night").length >= 3},
    {name:"Main Character Finder", on:reviews.filter(r=>r.score >= 9).length >= 3},
    {name:"Area Explorer", on:new Set(reviews.map(r=>r.area).filter(Boolean)).size >= 4}
  ];
  $("#badgeRow").innerHTML = badges.map(b=>`<span class="game-badge ${b.on ? "" : "locked"}">${b.on ? "✓" : "○"} ${b.name}</span>`).join("");
}

function updateDashboard(){
  criticProgress();

  const total = reviews.length;
  $("#dashTotal").textContent = total;
  $("#dashAverage").textContent = total ? (reviews.reduce((s,r)=>s+r.score,0)/total).toFixed(1) : "0.0";
  $("#dashElite").textContent = reviews.filter(r=>r.score >= 9).length;

  const countBy = (arr, keyFn) => {
    const map = {};
    arr.forEach(x=>{
      const key = keyFn(x);
      if(!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  };

  const areaMap = countBy(reviews, r=>r.area);
  const topArea = Object.entries(areaMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || "None";
  $("#dashArea").textContent = topArea;

  const tagMap = countBy(reviews, r=>r.tag);
  const topTag = Object.entries(tagMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || "None";
  $("#dashTag").textContent = topTag;

  const bestSushi = [...reviews].filter(r=>r.venue_type === "sushi").sort((a,b)=>b.score-a.score)[0]?.name || "None";
  $("#dashBestSushi").textContent = bestSushi;

  if(!total){
    $("#championName").textContent = "No places rated yet";
    $("#championMeta").textContent = "Start by adding Tal's first review.";
    $("#championScore").textContent = "0.0";
    $("#championVerdict").textContent = "Waiting for Tal's verdict";
    return;
  }
  const champion = [...reviews].sort((a,b)=>b.score-a.score || new Date(b.visit_date||0)-new Date(a.visit_date||0))[0];
  $("#championName").textContent = champion.name;
  $("#championMeta").textContent = `${champion.cuisine} · ${champion.area} · ${champion.price}`;
  $("#championScore").textContent = champion.score.toFixed(1);
  $("#championVerdict").textContent = verdictFor(champion.score);
}

function updateFilters(){
  const currentArea = $("#areaFilter").value;
  const currentCuisine = $("#cuisineFilter").value;
  const currentTag = $("#tagFilter").value;
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

  const areas = uniq(reviews.map(r=>r.area));
  const cuisines = uniq(reviews.map(r=>r.cuisine));
  const tags = uniq(reviews.map(r=>r.tag));

  $("#areaFilter").innerHTML = '<option value="">All areas</option>' + areas.map(v=>`<option ${v===currentArea?"selected":""}>${escapeHtml(v)}</option>`).join("");
  $("#cuisineFilter").innerHTML = '<option value="">All cuisines</option>' + cuisines.map(v=>`<option ${v===currentCuisine?"selected":""}>${escapeHtml(v)}</option>`).join("");
  $("#tagFilter").innerHTML = '<option value="">All tags</option>' + tags.map(v=>`<option ${v===currentTag?"selected":""}>${escapeHtml(v)}</option>`).join("");
}

function render(){
  const q = $("#searchInput").value.trim().toLowerCase();
  const area = $("#areaFilter").value;
  const cuisine = $("#cuisineFilter").value;
  const tag = $("#tagFilter").value;
  const sort = $("#sortFilter").value;

  let visible = reviews.filter(r=>{
    const hay = `${r.name} ${r.area} ${r.cuisine} ${r.tag} ${r.best_dish||""} ${r.notes||""}`.toLowerCase();
    return (!q || hay.includes(q)) && (!area || r.area===area) && (!cuisine || r.cuisine===cuisine) && (!tag || r.tag===tag);
  });

  visible.sort((a,b)=>{
    if(sort==="score-desc") return b.score-a.score || new Date(b.visit_date||0)-new Date(a.visit_date||0);
    if(sort==="score-asc") return a.score-b.score;
    if(sort==="recent") return new Date(b.visit_date||0)-new Date(a.visit_date||0);
    return a.name.localeCompare(b.name);
  });

  $("#reviewList").innerHTML = visible.map((r)=>`
    <article class="review-card" data-id="${r.id}">
      <img class="review-thumb" src="${escapeHtml(r.photo_url || '')}" alt="${escapeHtml(r.name)}" />
      <div>
        <div class="review-title">
          <strong>${escapeHtml(r.name)}</strong>
          ${r.score>=9 ? '<span class="badge">9+ CLUB</span>' : r.score>=8.5 ? '<span class="badge">FAVORITE</span>' : ''}
        </div>
        <div class="review-meta">${escapeHtml(r.cuisine)} · ${escapeHtml(r.area)} · ${escapeHtml(r.price)}</div>
        <div class="review-tags">
          <span class="mini-tag">${escapeHtml(r.tag)}</span>
          <span class="mini-tag">${escapeHtml(r.venue_type)}</span>
        </div>
        <div class="verdict-chip ${r.score>=9 ? "elite":""}">${verdictFor(r.score)}</div>
      </div>
      <div class="review-score">
        <strong>${r.score.toFixed(1)}</strong>
        <span>${Math.round(r.score)}/10 stars</span>
      </div>
    </article>
  `).join("");

  $$(".review-card").forEach(card=>card.addEventListener("click", ()=>openDetail(card.dataset.id)));
  $("#emptyState").style.display = reviews.length ? "none" : "block";
  $("#reviewList").style.display = reviews.length ? "grid" : "none";

  updateFilters();
  updateDashboard();
}

async function fileToDataUrl(file){
  return await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handlePhotoSelected(file){
  currentPhotoFile = file || null;
  if(!file){
    $("#photoPreview").classList.add("hidden");
    $("#photoStatus").textContent = "Take or upload one photo of the restaurant or food.";
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  $("#photoPreview").src = dataUrl;
  $("#photoPreview").classList.remove("hidden");
  $("#photoStatus").textContent = `Photo ready: ${file.name}`;
}

async function uploadPhoto(file){
  if(!supabase || !file){
    return await fileToDataUrl(file);
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `public/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false });
  if(error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function fetchReviews(){
  if(!supabase){
    reviews = JSON.parse(localStorage.getItem("tals-table-local-fallback") || "[]");
    render();
    return;
  }
  const { data, error } = await supabase.from("restaurant_reviews").select("*").order("score", { ascending: false });
  if(error){
    toast("Could not load data");
    console.error(error);
    return;
  }
  reviews = data || [];
  render();
}

async function saveReview(item){
  if(!supabase){
    reviews.push(item);
    localStorage.setItem("tals-table-local-fallback", JSON.stringify(reviews));
    render();
    return item;
  }
  const { data, error } = await supabase.from("restaurant_reviews").insert(item).select().single();
  if(error) throw error;
  reviews.unshift(data);
  render();
  return data;
}

function breakdownRow(label,val){
  return `<div class="breakdown-row"><span>${label}</span><div class="bar"><i style="width:${(+val||0)*10}%"></i></div><strong>${val}/10</strong></div>`;
}

function openDetail(id){
  const r = reviews.find(x=>String(x.id)===String(id));
  if(!r) return;
  activeDetailId = id;
  $("#detailName").textContent = r.name;
  $("#detailBody").innerHTML = `
    <img class="detail-photo" src="${escapeHtml(r.photo_url || '')}" alt="${escapeHtml(r.name)}" />
    <div class="detail-score"><strong>${r.score.toFixed(1)}</strong><span>${starText(r.score)}</span></div>
    <div class="detail-tags">
      <span class="detail-tag">${escapeHtml(verdictFor(r.score))}</span>
      <span class="detail-tag">${escapeHtml(r.tag)}</span>
      <span class="detail-tag">${escapeHtml(r.venue_type)}</span>
      <span class="detail-tag">${escapeHtml(r.cuisine)}</span>
      <span class="detail-tag">${escapeHtml(r.area)}</span>
      <span class="detail-tag">${escapeHtml(r.price)}</span>
      ${r.visit_date ? `<span class="detail-tag">${escapeHtml(r.visit_date)}</span>` : ""}
    </div>
    ${r.best_dish ? `<p><strong>Best bite:</strong> ${escapeHtml(r.best_dish)}</p>` : ""}
    <div class="breakdown">
      ${breakdownRow("Drive", r.drive)}
      ${breakdownRow("Parking", r.parking)}
      ${breakdownRow("Wait", r.wait)}
      ${breakdownRow("Welcome", r.welcome)}
      ${breakdownRow("Warmth", r.warmth)}
      ${breakdownRow("Timing", r.timing)}
      ${breakdownRow("Accuracy", r.accuracy)}
      ${breakdownRow("Food", r.food)}
      ${breakdownRow("Freshness", r.freshness)}
      ${breakdownRow("Atmosphere", r.atmosphere)}
      ${breakdownRow("Noise", r.noise)}
      ${breakdownRow("Value", r.value)}
      ${breakdownRow("Craving", r.craving)}
    </div>
    ${r.notes ? `<p class="quote">“${escapeHtml(r.notes)}”</p>` : ""}
    <div class="detail-actions">
      <button class="primary-btn" id="shareReview">Share score</button>
    </div>
  `;
  $("#detailModal").classList.add("open");
  $("#shareReview").onclick = async ()=>{
    const text = `${r.name}: ${r.score.toFixed(1)}/10, ${verdictFor(r.score)}, tagged ${r.tag}, rated on Tal's Table`;
    try{
      if(navigator.share) await navigator.share({title:"Tal's Table", text});
      else{
        await navigator.clipboard.writeText(text);
        toast("Score copied");
      }
    }catch(e){}
  };
}

function loadDemo(){
  const demo = [
    {id:uid(), name:"Uchi", venue_type:"sushi", cuisine:"Japanese", area:"Wynwood", price:"$$$$", visit_date:"2026-08-08", best_dish:"Hama chili", tag:"date night", photo_url:"https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=900&q=80", drive:9, parking:7, wait:8, welcome:9, warmth:9, timing:9, accuracy:10, food:10, freshness:10, atmosphere:9, noise:8, value:8, craving:10, recommend:"yes", moment:"date", choose_again:"yes", notes:"So polished, so fresh, so easy to crave again."},
    {id:uid(), name:"Casa Tua", venue_type:"restaurant", cuisine:"Italian", area:"Miami Beach", price:"$$$$", visit_date:"2026-08-14", best_dish:"Truffle pasta", tag:"girls night", photo_url:"https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80", drive:8, parking:6, wait:7, welcome:9, warmth:8, timing:8, accuracy:9, food:9, freshness:9, atmosphere:10, noise:7, value:7, craving:9, recommend:"yes", moment:"celebration", choose_again:"yes", notes:"The room is gorgeous and the whole night feels special."},
    {id:uid(), name:"Maman", venue_type:"cafe", cuisine:"Café", area:"Wynwood", price:"$$", visit_date:"2026-08-19", best_dish:"Chocolate chip cookie", tag:"lunch break", photo_url:"https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80", drive:7, parking:8, wait:8, welcome:8, warmth:9, timing:8, accuracy:9, food:8, freshness:8, atmosphere:9, noise:8, value:8, craving:8, recommend:"yes", moment:"casual", choose_again:"yes", notes:"Cute, soft, and easy when you want something simple but pretty."}
  ].map(x=>({...x, score:calcScore({...x, venueType:x.venue_type, chooseAgain:x.choose_again})}));

  reviews = demo;
  localStorage.setItem("tals-table-local-fallback", JSON.stringify(reviews));
  render();
  toast("Demo loaded locally");
}

$("#seedBtn").addEventListener("click", loadDemo);
$("#refreshBtn").addEventListener("click", fetchReviews);
$("#exportBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(reviews,null,2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tals-table-reviews.json";
  a.click();
});
$("#installHintBtn").addEventListener("click", ()=>toast("On iPhone: Safari → Share → Add to Home Screen"));

$$("[data-open-review]").forEach(btn=>btn.addEventListener("click", openReview));
$("[data-scroll-top]").addEventListener("click", ()=>window.scrollTo({top:0, behavior:"smooth"}));
$("#closeModal").addEventListener("click", closeReview);
$("#closeDetail").addEventListener("click", closeDetail);
$("#reviewModal").addEventListener("click", e=>{ if(e.target.id==="reviewModal") closeReview(); });
$("#detailModal").addEventListener("click", e=>{ if(e.target.id==="detailModal") closeDetail(); });
$("#backBtn").addEventListener("click", ()=>setStep(currentStep-1));
$("#nextBtn").addEventListener("click", ()=>{ if(currentStep===1 && !validateStepOne()) return; setStep(currentStep+1); });

$("#reviewForm").addEventListener("input", e=>{
  if(e.target.type === "range"){
    const out = document.getElementById(e.target.name + "Out");
    if(out) out.textContent = e.target.value;
  }
  updatePreview();
});

$("#reviewForm").elements.photo.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  await handlePhotoSelected(file);
});

["searchInput","areaFilter","cuisineFilter","tagFilter","sortFilter"].forEach(id=>{
  $("#"+id).addEventListener(id==="searchInput" ? "input" : "change", render);
});

$("#reviewForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!validateStepOne()) return;

  try{
    toast("Uploading photo...");
    const data = formData();
    const photoUrl = await uploadPhoto(currentPhotoFile);
    const item = {
      id: uid(),
      name: data.name,
      venue_type: data.venueType,
      cuisine: data.cuisine,
      area: data.area,
      price: data.price,
      visit_date: data.date || null,
      best_dish: data.bestDish || null,
      tag: data.tag,
      photo_url: photoUrl,
      drive: +data.drive, parking:+data.parking, wait:+data.wait, welcome:+data.welcome, warmth:+data.warmth,
      timing:+data.timing, accuracy:+data.accuracy, food:+data.food, freshness:+data.freshness,
      atmosphere:+data.atmosphere, noise:+data.noise, value:+data.value, craving:+data.craving,
      recommend: data.recommend, moment: data.moment, choose_again: data.chooseAgain, notes: data.notes || null
    };
    item.score = calcScore({...item, venueType:item.venue_type, chooseAgain:item.choose_again});
    await saveReview(item);
    closeReview();
    toast(`${item.name} scored ${item.score.toFixed(1)} / 10`);
  } catch(err){
    console.error(err);
    toast("Could not save review");
  }
});

if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
fetchReviews();
