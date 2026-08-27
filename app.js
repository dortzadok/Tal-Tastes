const CONFIG = window.APP_CONFIG || {};
const STORAGE_BUCKET = "restaurant-photos";
const LOCAL_DB_NAME = "tal-tastes-local-v1";
const LOCAL_STORE = "reviews";
let supabaseClient = null;
let reviews = [];
let currentStep = 1;
let currentPhoto = null;
let activeDetailId = null;
let editingReviewId = null;
const AUTH_KEY = "tal-tastes-auth-v1";
const CUSTOM_TAGS_KEY = "tal-tastes-custom-tags-v1";
const PLACE_TYPE_LABELS = {
  "fine-dining":"Fine Dining", "casual-dining":"Casual Restaurant", "fast-casual":"Fast Casual",
  "sushi":"Sushi / Omakase", "tasting-menu":"Tasting Menu", "cafe":"Café", "brunch-spot":"Brunch Spot",
  "bar":"Bar / Lounge", "rooftop":"Rooftop", "bakery-dessert":"Bakery / Dessert",
  "hotel-restaurant":"Hotel Restaurant", "food-hall":"Food Hall", "food-truck":"Food Truck",
  "takeout":"Takeout / Delivery", "buffet":"Buffet"
};

if (window.supabase && CONFIG.supabaseUrl && CONFIG.supabaseAnonKey) {
  supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const uuid = () => (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2,9));
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));
const round1 = (n) => Math.round(n*10)/10;
const escapeHtml = (str="") => String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));

function scoreDataFromForm(){
  const fd = new FormData($("#reviewForm"));
  return Object.fromEntries(fd.entries());
}

function calcScore(data){
  const w = {
    drive:.025, parking:.03, wait:.04, welcome:.05, warmth:.055,
    knowledge:.045, accuracy:.055, timing:.055, food:.19, freshness:.10,
    atmosphere:.08, noise:.04, cleanliness:.05, value:.065, craving:.12
  };
  let score = 0;
  Object.entries(w).forEach(([key, weight]) => score += (+data[key] || 0) * weight);

  if(data.recommend === "yes") score += .08;
  if(data.recommend === "no") score -= .18;
  if(data.chooseAgain === "yes") score += .08;
  if(data.chooseAgain === "no") score -= .16;

  if(data.venueType === "sushi" && +data.food >= 9 && +data.freshness >= 9) score += .08;
  if(data.venueType === "bar" && +data.atmosphere >= 9 && +data.noise >= 7) score += .05;
  if(data.venueType === "cafe" && +data.atmosphere >= 9) score += .04;
  return round1(clamp(score,1,10));
}

function verdictFor(score){
  if(score >= 9.6) return "Main Character Meal";
  if(score >= 9.0) return "Tal Certified";
  if(score >= 8.4) return "Would Book Again";
  if(score >= 7.5) return "Cute But Flawed";
  if(score >= 6.5) return "Only If Nearby";
  return "Not Worth the Outfit";
}
function starText(score){
  const full = Math.round(clamp(score/2,0,5));
  return "★".repeat(full) + "☆".repeat(5-full);
}
function starPercent(score){ return `${clamp((+score||0)*10,0,100)}%`; }
function starMeterHtml(score, extraClass=""){
  return `<span class="star-meter ${extraClass}"><span class="star-bg">★★★★★</span><span class="star-fill" style="width:${starPercent(score)}">★★★★★</span></span>`;
}
function humanizeType(type){ return PLACE_TYPE_LABELS[type] || String(type||"Other").replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase()); }
function getCustomTags(){
  try{ return JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY)||"[]").filter(Boolean); }catch(e){ return []; }
}
function saveCustomTags(tags){ localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify([...new Set(tags.map(t=>t.trim().toLowerCase()).filter(Boolean))])); }
function ensureTagOption(tag, checked=false){
  const value=String(tag||"").trim().toLowerCase(); if(!value) return;
  let input=$$('input[name="tags"]').find(el=>el.value===value);
  if(!input){
    const label=document.createElement("label"); label.className="tag-choice";
    label.innerHTML=`<input type="checkbox" name="tags" value="${escapeHtml(value)}" /><span>${escapeHtml(value)}</span>`;
    $(".tag-picker").appendChild(label); input=label.querySelector("input");
  }
  if(checked) input.checked=true;
}
function loadCustomTags(){ getCustomTags().forEach(t=>ensureTagOption(t,false)); }
function getVenueTypeFromForm(){
  const selected=$("#venueType").value;
  if(selected==="other"){
    const custom=$("#customVenueType").value.trim();
    return custom ? custom.toLowerCase() : "other";
  }
  return selected;
}
function setVenueTypeOnForm(type){
  const select=$("#venueType");
  const known=[...select.options].map(o=>o.value);
  if(known.includes(type)){ select.value=type; $("#customVenueType").value=""; }
  else{ select.value="other"; $("#customVenueType").value=type||""; }
  $("#customVenueType").classList.toggle("hidden",select.value!=="other");
}
function toast(msg){
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.remove("show"), 2200);
}

function showLogin(){ $("#loginGate").classList.remove("hidden"); $("#loginGate").setAttribute("aria-hidden","false"); setTimeout(()=>$("#loginPin").focus(),80); }
function hideLogin(){ $("#loginGate").classList.add("hidden"); $("#loginGate").setAttribute("aria-hidden","true"); }
function isAuthenticated(){ return localStorage.getItem(AUTH_KEY)==="1" || sessionStorage.getItem(AUTH_KEY)==="1"; }
function tryLogin(){
  const name=$("#loginName").value.trim().toLowerCase();
  const pin=$("#loginPin").value.trim();
  if(name==="tal" && pin==="1114"){
    if($("#rememberLogin").checked) localStorage.setItem(AUTH_KEY,"1"); else sessionStorage.setItem(AUTH_KEY,"1");
    $("#loginError").textContent=""; $("#loginPin").value=""; hideLogin(); toast("Welcome back, Tal ♡"); return true;
  }
  $("#loginError").textContent="That username or PIN is not right."; return false;
}
function logout(){ localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); $("#profileModal").classList.remove("open"); showLogin(); }

function openLocalDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(LOCAL_DB_NAME,1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(LOCAL_STORE)) db.createObjectStore(LOCAL_STORE,{keyPath:"id"});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function localGetAll(){
  const db = await openLocalDB();
  return await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_STORE,"readonly");
    const req = tx.objectStore(LOCAL_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function localPut(item){
  const db = await openLocalDB();
  return await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_STORE,"readwrite");
    tx.objectStore(LOCAL_STORE).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Local save failed"));
  });
}
async function localDelete(id){
  const db = await openLocalDB();
  return await new Promise((resolve,reject)=>{
    const tx = db.transaction(LOCAL_STORE,"readwrite");
    tx.objectStore(LOCAL_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function compressImage(file, maxWidth=1100){
  if(!file) throw new Error("Photo is required");
  const source = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve,reject)=>{
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("This photo could not be opened. Try another photo."));
    i.src = source;
  });

  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d", {alpha:false});
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);

  let quality = .72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while(dataUrl.length > 950000 && quality > .36){
    quality -= .10;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  const blob = await new Promise((resolve,reject)=>{
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not compress photo")), "image/jpeg", quality);
  });
  return {dataUrl, blob, width:canvas.width, height:canvas.height};
}

async function handlePhotoSelected(file){
  currentPhoto = null;
  $("#photoPreview").classList.add("hidden");
  if(!file){
    $("#photoStatus").textContent = "Take or upload one photo of the restaurant, table, or food.";
    return;
  }
  try{
    $("#photoStatus").textContent = "Preparing photo...";
    currentPhoto = await compressImage(file);
    $("#photoPreview").src = currentPhoto.dataUrl;
    $("#photoPreview").classList.remove("hidden");
    $("#photoStatus").textContent = "Photo ready ✓";
  }catch(err){
    console.error(err);
    currentPhoto = null;
    $("#reviewForm").elements.photo.value = "";
    $("#photoStatus").textContent = err.message || "Could not prepare photo.";
    toast("Try a different photo");
  }
}

function selectedTags(){
  return $$('input[name="tags"]:checked').map(el=>el.value);
}
function validateStepOne(){
  const form = $("#reviewForm");
  for(const name of ["name","cuisine","area"]){
    if(!form.elements[name].value.trim()){
      form.elements[name].focus();
      toast("Fill in the basic details first");
      return false;
    }
  }
  if($("#venueType").value==="other" && !$("#customVenueType").value.trim()){
    $("#customVenueType").classList.remove("hidden"); $("#customVenueType").focus(); toast("Tell me what type of place it is"); return false;
  }
  if(selectedTags().length === 0){
    toast("Choose at least one vibe tag");
    return false;
  }
  if(!currentPhoto){
    toast("A restaurant photo is required");
    return false;
  }
  return true;
}

function setStep(step){
  currentStep = step;
  $$(".form-step").forEach(el=>el.classList.toggle("active",+el.dataset.step===step));
  $$('[data-step-dot]').forEach(el=>el.classList.toggle("active",+el.dataset.stepDot<=step));
  $("#backBtn").classList.toggle("hidden",step===1);
  $("#nextBtn").classList.toggle("hidden",step===3);
  $("#saveBtn").classList.toggle("hidden",step!==3);
  if(step===3) updatePreview();
  $("#reviewModal .modal-sheet").scrollTo({top:0,behavior:"smooth"});
}
function openReview(review=null){
  editingReviewId = review?.id || null;
  const form=$("#reviewForm"); form.reset(); loadCustomTags();
  form.elements.date.value = new Date().toISOString().slice(0,10);
  ["drive","parking","wait","welcome","warmth","knowledge","accuracy","timing","food","freshness","atmosphere","noise","cleanliness","value","craving"].forEach(name=>{
    form.elements[name].value=8; const out=document.getElementById(name+"Out"); if(out) out.textContent=8;
  });
  $("#reviewModalEyebrow").textContent=review?"EDIT REVIEW":"NEW REVIEW";
  $("#reviewModalTitle").textContent=review?`Edit ${review.name}`:"Tal's scorecard";
  $("#saveBtn").textContent=review?"Save changes":"Save review";
  currentPhoto=null; $("#photoPreview").src=""; $("#photoPreview").classList.add("hidden");
  $("#photoStatus").textContent="Take or upload one photo of the restaurant, table, or food.";
  setVenueTypeOnForm("casual-dining");

  if(review){
    form.elements.name.value=review.name||""; form.elements.cuisine.value=review.cuisine||""; form.elements.area.value=review.area||"";
    form.elements.price.value=review.price||"$$$"; form.elements.date.value=review.visit_date||new Date().toISOString().slice(0,10);
    form.elements.bestDish.value=review.best_dish||""; setVenueTypeOnForm(review.venue_type||"casual-dining");
    normalizedTags(review).forEach(tag=>ensureTagOption(tag,true));
    ["drive","parking","wait","welcome","warmth","knowledge","accuracy","timing","food","freshness","atmosphere","noise","cleanliness","value","craving"].forEach(name=>{
      const v=review[name] ?? 8; form.elements[name].value=v; const out=document.getElementById(name+"Out"); if(out) out.textContent=v;
    });
    const recommend=form.querySelector(`input[name="recommend"][value="${review.recommend||"yes"}"]`); if(recommend) recommend.checked=true;
    const choose=form.querySelector(`input[name="chooseAgain"][value="${review.choose_again||"yes"}"]`); if(choose) choose.checked=true;
    form.elements.notes.value=review.notes||"";
    if(review.photo_url){ currentPhoto={dataUrl:review.photo_url,existingUrl:review.photo_url,blob:null}; $("#photoPreview").src=review.photo_url; $("#photoPreview").classList.remove("hidden"); $("#photoStatus").textContent="Current photo kept ✓, choose a new one only if you want to replace it."; }
  }
  setStep(1); $("#reviewModal").classList.add("open"); $("#reviewModal").setAttribute("aria-hidden","false");
}
function closeReview(){
  $("#reviewModal").classList.remove("open");
  $("#reviewModal").setAttribute("aria-hidden","true");
}
function closeDetail(){
  $("#detailModal").classList.remove("open");
  $("#detailModal").setAttribute("aria-hidden","true");
}
function updatePreview(){
  const data = scoreDataFromForm();
  const score = calcScore(data);
  $("#scorePreview").textContent=score.toFixed(1);
  $("#starPreviewFill").style.width=starPercent(score);
  $("#verdictPreview").textContent=verdictFor(score);
}

async function uploadPhotoToCloud(){
  if(currentPhoto?.existingUrl && !currentPhoto?.blob) return currentPhoto.existingUrl;
  if(!supabaseClient) return currentPhoto.dataUrl;
  const path = `public/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  const {error} = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path,currentPhoto.blob,{contentType:"image/jpeg",upsert:false});
  if(error) throw error;
  const {data} = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
async function fetchReviews(){
  try{
    if(supabaseClient){
      const {data,error} = await supabaseClient.from("restaurant_reviews").select("*").order("created_at",{ascending:false});
      if(error) throw error;
      reviews = data || [];
    }else{
      reviews = await localGetAll();
    }
    reviews.sort((a,b)=>(b.score||0)-(a.score||0));
    render();
  }catch(err){
    console.error(err);
    toast("Could not load reviews");
  }
}
async function saveReview(item){
  if(supabaseClient){
    const {data,error} = await supabaseClient.from("restaurant_reviews").upsert(item,{onConflict:"id"}).select().single();
    if(error) throw error;
    return data;
  }
  return await localPut(item);
}
async function deleteReview(id){
  if(supabaseClient){
    const {error} = await supabaseClient.from("restaurant_reviews").delete().eq("id",id);
    if(error) throw error;
  }else{
    await localDelete(id);
  }
  reviews = reviews.filter(r=>String(r.id)!==String(id));
  render();
}

function normalizedTags(r){
  if(Array.isArray(r.tags)) return r.tags;
  if(typeof r.tags === "string"){
    try{ const parsed=JSON.parse(r.tags); if(Array.isArray(parsed)) return parsed; }catch(e){}
    return r.tags ? [r.tags] : [];
  }
  if(r.tag) return [r.tag];
  return [];
}
function countTop(values){
  const counts={};
  values.filter(Boolean).forEach(v=>counts[v]=(counts[v]||0)+1);
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "None";
}
function criticProgress(){
  const n=reviews.length;
  const levels=[
    {name:"Baby Critic",min:0,next:3},{name:"Hot Girl Foodie",min:3,next:8},
    {name:"Pink Tastemaker",min:8,next:15},{name:"Reservation Royalty",min:15,next:25},
    {name:"Tal the Critic",min:25,next:null}
  ];
  let level=levels[0]; levels.forEach(l=>{if(n>=l.min) level=l});
  const pct=level.next?((n-level.min)/(level.next-level.min))*100:100;
  $("#criticLevel").textContent=level.name;
  $("#criticXP").textContent=n*100;
  $("#levelBar").style.width=`${clamp(pct,0,100)}%`;
  $("#levelHint").textContent=level.next?(n?`${level.next-n} more review${level.next-n===1?"":"s"} to unlock the next level.`:"Your first review unlocks the game."):"Top level unlocked.";
  const allTags=reviews.flatMap(normalizedTags);
  const badges=[
    {name:"First Bite",on:n>=1},
    {name:"Sushi Sweetheart",on:reviews.filter(r=>r.venue_type==="sushi").length>=3},
    {name:"Worth The Drive",on:reviews.filter(r=>+r.drive>=8).length>=4},
    {name:"Girls Night Scout",on:allTags.filter(t=>t==="girls night").length>=3},
    {name:"Main Character Finder",on:reviews.filter(r=>+r.score>=9).length>=3},
    {name:"Area Explorer",on:new Set(reviews.map(r=>r.area).filter(Boolean)).size>=4}
  ];
  $("#badgeRow").innerHTML=badges.map(b=>`<span class="game-badge ${b.on?"":"locked"}">${b.on?"✓":"○"} ${b.name}</span>`).join("");
}
function updateDashboard(){
  criticProgress();
  const n=reviews.length;
  $("#dashTotal").textContent=n;
  $("#dashAverage").textContent=n?(reviews.reduce((s,r)=>s+(+r.score||0),0)/n).toFixed(1):"0.0";
  $("#dashElite").textContent=reviews.filter(r=>+r.score>=9).length;
  const now=new Date();
  $("#dashMonth").textContent=reviews.filter(r=>{
    const d=new Date(r.visit_date||r.created_at||0);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  }).length;
  $("#dashArea").textContent=countTop(reviews.map(r=>r.area));
  $("#dashTag").textContent=countTop(reviews.flatMap(normalizedTags));
  $("#dashBestSushi").textContent=[...reviews].filter(r=>r.venue_type==="sushi").sort((a,b)=>b.score-a.score)[0]?.name||"None";
  $("#dashReturn").textContent=n?`${Math.round(reviews.filter(r=>+r.craving>=8).length/n*100)}%`:"0%";
  $("#dashCuisines").textContent=new Set(reviews.map(r=>(r.cuisine||"").toLowerCase()).filter(Boolean)).size;
  $("#dashMainCharacter").textContent=reviews.filter(r=>+r.score>=9.5).length;

  if(!n){
    $("#championName").textContent="No places rated yet";
    $("#championMeta").textContent="Your first review starts the ranking.";
    $("#championScore").textContent="0.0";
    $("#championVerdict").textContent="Waiting for Tal's verdict";
    $("#championStarFill").style.width="0%";
    return;
  }
  const champ=[...reviews].sort((a,b)=>b.score-a.score)[0];
  $("#championName").textContent=champ.name;
  $("#championMeta").textContent=`${champ.cuisine} · ${champ.area} · ${champ.price}`;
  $("#championScore").textContent=(+champ.score).toFixed(1);
  $("#championVerdict").textContent=verdictFor(+champ.score);
  $("#championStarFill").style.width=starPercent(+champ.score);
}
function updateFilters(){
  const keep={area:$("#areaFilter").value,cuisine:$("#cuisineFilter").value,type:$("#typeFilter").value,tag:$("#tagFilter").value};
  const uniq=arr=>[...new Set(arr.filter(Boolean))].sort();
  const setOptions=(el,allLabel,vals,current,labeler=(v)=>v)=>{
    el.innerHTML=`<option value="">${allLabel}</option>`+vals.map(v=>`<option value="${escapeHtml(v)}" ${v===current?"selected":""}>${escapeHtml(labeler(v))}</option>`).join("");
    if(current && !vals.includes(current)){ const opt=new Option(labeler(current),current,true,true); el.add(opt); }
  };
  setOptions($("#areaFilter"),"All areas",uniq(reviews.map(r=>r.area)),keep.area);
  setOptions($("#cuisineFilter"),"All cuisines",uniq(reviews.map(r=>r.cuisine)),keep.cuisine);
  const typeValues=uniq([...Object.keys(PLACE_TYPE_LABELS),...reviews.map(r=>r.venue_type)]);
  setOptions($("#typeFilter"),"All place types",typeValues,keep.type,humanizeType);
  setOptions($("#tagFilter"),"All tags",uniq(reviews.flatMap(normalizedTags)),keep.tag);
}
function matchesDateFilter(r,filter){
  if(!filter) return true; const d=new Date(r.visit_date||r.created_at||0); if(Number.isNaN(d.getTime())) return false;
  const now=new Date(); const startToday=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(filter==="month") return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  if(filter==="year") return d.getFullYear()===now.getFullYear();
  if(filter==="30"||filter==="90"){ const cutoff=new Date(startToday); cutoff.setDate(cutoff.getDate()-Number(filter)); return d>=cutoff; }
  return true;
}
function render(){
  const q=$("#searchInput").value.trim().toLowerCase();
  const area=$("#areaFilter").value, cuisine=$("#cuisineFilter").value, type=$("#typeFilter").value, tag=$("#tagFilter").value;
  const price=$("#priceFilter").value, scoreFilter=$("#scoreFilter").value, dateFilter=$("#dateFilter").value, sort=$("#sortFilter").value;
  let visible=reviews.filter(r=>{
    const tags=normalizedTags(r); const hay=`${r.name} ${r.area} ${r.cuisine} ${humanizeType(r.venue_type)} ${tags.join(" ")} ${r.best_dish||""} ${r.notes||""}`.toLowerCase();
    let scoreOk=true; if(scoreFilter==="under7") scoreOk=+r.score<7; else if(scoreFilter) scoreOk=+r.score>=+scoreFilter;
    return (!q||hay.includes(q))&&(!area||r.area===area)&&(!cuisine||r.cuisine===cuisine)&&(!type||r.venue_type===type)&&(!tag||tags.includes(tag))&&(!price||r.price===price)&&scoreOk&&matchesDateFilter(r,dateFilter);
  });
  visible.sort((a,b)=>{
    if(sort==="score-desc") return b.score-a.score; if(sort==="score-asc") return a.score-b.score;
    if(sort==="recent") return new Date(b.visit_date||b.created_at||0)-new Date(a.visit_date||a.created_at||0);
    if(sort==="oldest") return new Date(a.visit_date||a.created_at||0)-new Date(b.visit_date||b.created_at||0);
    if(sort==="price-asc") return String(a.price||"").length-String(b.price||"").length;
    if(sort==="price-desc") return String(b.price||"").length-String(a.price||"").length;
    return a.name.localeCompare(b.name);
  });
  $("#reviewList").innerHTML=visible.map(r=>{
    const tags=normalizedTags(r);
    return `<article class="review-card" data-id="${escapeHtml(r.id)}">
      <img class="review-thumb" src="${escapeHtml(r.photo_url||"")}" alt="${escapeHtml(r.name)}" />
      <div><div class="review-title"><strong>${escapeHtml(r.name)}</strong>${r.score>=9?'<span class="badge">9+ CLUB</span>':r.score>=8.5?'<span class="badge">FAVORITE</span>':''}</div>
      <div class="review-meta">${escapeHtml(r.cuisine)} · ${escapeHtml(humanizeType(r.venue_type))} · ${escapeHtml(r.area)} · ${escapeHtml(r.price)}</div>
      <div class="review-tags">${tags.slice(0,3).map(t=>`<span class="mini-tag">${escapeHtml(t)}</span>`).join("")}</div>
      <div class="verdict-chip ${r.score>=9?"elite":""}">${verdictFor(+r.score)}</div></div>
      <div class="review-score"><strong>${(+r.score).toFixed(1)}</strong><span>out of 10</span>${starMeterHtml(+r.score,"review-star-meter")}</div>
    </article>`;
  }).join("");
  $$(".review-card").forEach(card=>card.addEventListener("click",()=>openDetail(card.dataset.id)));
  $("#emptyState").style.display=reviews.length?"none":"block"; $("#reviewList").style.display=reviews.length?"grid":"none";
  updateFilters(); updateDashboard();
}
function breakdownRow(label,val){
  return `<div class="breakdown-row"><span>${label}</span><div class="bar"><i style="width:${(+val||0)*10}%"></i></div><strong>${val}/10</strong></div>`;
}
function openDetail(id){
  const r=reviews.find(x=>String(x.id)===String(id)); if(!r) return;
  activeDetailId=id;
  const tags=normalizedTags(r);
  $("#detailName").textContent=r.name;
  $("#detailBody").innerHTML=`
    <img class="detail-photo" src="${escapeHtml(r.photo_url||"")}" alt="${escapeHtml(r.name)}" />
    <div class="detail-score"><strong>${(+r.score).toFixed(1)}</strong><span>/ 10</span>${starMeterHtml(+r.score,"detail-star-meter")}</div>
    <div class="detail-tags"><span class="detail-tag">${escapeHtml(verdictFor(+r.score))}</span>${tags.map(t=>`<span class="detail-tag">${escapeHtml(t)}</span>`).join("")}<span class="detail-tag">${escapeHtml(r.cuisine)}</span><span class="detail-tag">${escapeHtml(humanizeType(r.venue_type))}</span><span class="detail-tag">${escapeHtml(r.area)}</span></div>
    ${r.best_dish?`<p><strong>Best bite:</strong> ${escapeHtml(r.best_dish)}</p>`:""}
    <div class="breakdown">${breakdownRow("Drive",r.drive)}${breakdownRow("Parking",r.parking)}${breakdownRow("Wait",r.wait)}${breakdownRow("Welcome",r.welcome)}${breakdownRow("Warmth",r.warmth)}${breakdownRow("Menu knowledge",r.knowledge)}${breakdownRow("Accuracy",r.accuracy)}${breakdownRow("Timing",r.timing)}${breakdownRow("Food",r.food)}${breakdownRow("Freshness",r.freshness)}${breakdownRow("Atmosphere",r.atmosphere)}${breakdownRow("Noise",r.noise)}${breakdownRow("Cleanliness",r.cleanliness)}${breakdownRow("Value",r.value)}${breakdownRow("Craving",r.craving)}</div>
    ${r.notes?`<p class="quote">“${escapeHtml(r.notes)}”</p>`:""}
    <div class="detail-actions"><button class="primary-btn edit-btn" id="editReview">Edit review</button><button class="ghost-btn" id="shareReview">Share score</button><button class="ghost-btn danger" id="deleteReview">Delete</button></div>`;
  $("#detailModal").classList.add("open");
  $("#detailModal").setAttribute("aria-hidden","false");
  $("#editReview").onclick=()=>{ closeDetail(); openReview(r); };
  $("#shareReview").onclick=async()=>{
    const text=`${r.name}: ${(+r.score).toFixed(1)}/10, ${verdictFor(+r.score)}, rated on Tal Tastes`;
    try{ if(navigator.share) await navigator.share({title:"Tal Tastes",text}); else{await navigator.clipboard.writeText(text);toast("Score copied");} }catch(e){}
  };
  $("#deleteReview").onclick=async()=>{
    if(!confirm(`Delete ${r.name}?`)) return;
    try{await deleteReview(r.id);closeDetail();toast("Review deleted");}catch(err){console.error(err);toast("Could not delete review");}
  };
}

$("#venueType").addEventListener("change",()=>$("#customVenueType").classList.toggle("hidden",$("#venueType").value!=="other"));
$("#addTagBtn").addEventListener("click",()=>{
  const input=$("#customTagInput"); const tag=input.value.trim().toLowerCase(); if(!tag) return;
  const custom=getCustomTags(); if(!custom.includes(tag)){ custom.push(tag); saveCustomTags(custom); } ensureTagOption(tag,true); input.value=""; toast(`Added tag: ${tag}`);
});
$("#customTagInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#addTagBtn").click();}});

$("#reviewForm").addEventListener("input",e=>{
  if(e.target.type==="range"){
    const out=document.getElementById(e.target.name+"Out"); if(out) out.textContent=e.target.value;
  }
  updatePreview();
});
$("#reviewForm").elements.photo.addEventListener("change",e=>handlePhotoSelected(e.target.files?.[0]));
$("#nextBtn").addEventListener("click",()=>{if(currentStep===1&&!validateStepOne())return;setStep(currentStep+1)});
$("#backBtn").addEventListener("click",()=>setStep(currentStep-1));
$("#closeModal").addEventListener("click",closeReview);
$("#closeDetail").addEventListener("click",closeDetail);
$("#reviewModal").addEventListener("click",e=>{if(e.target.id==="reviewModal")closeReview()});
$("#detailModal").addEventListener("click",e=>{if(e.target.id==="detailModal")closeDetail()});
$$('[data-open-review]').forEach(btn=>btn.addEventListener("click",()=>openReview()));
$("[data-scroll-top]").addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
$("#refreshBtn").addEventListener("click",fetchReviews);
$("#installHintBtn").addEventListener("click",()=>toast("Safari → Share → Add to Home Screen"));
["searchInput","areaFilter","cuisineFilter","typeFilter","tagFilter","priceFilter","scoreFilter","dateFilter","sortFilter"].forEach(id=>$("#"+id).addEventListener(id==="searchInput"?"input":"change",()=>{ $$(".quick-chip").forEach(b=>b.classList.remove("active")); render(); }));
$("#clearFiltersBtn").addEventListener("click",()=>{
  ["areaFilter","cuisineFilter","typeFilter","tagFilter","priceFilter","scoreFilter","dateFilter"].forEach(id=>$("#"+id).value=""); $("#sortFilter").value="score-desc"; $("#searchInput").value="";
  $$(".quick-chip").forEach(b=>b.classList.toggle("active",b.dataset.quick==="all")); render();
});
$$('.quick-chip').forEach(btn=>btn.addEventListener("click",()=>{
  ["areaFilter","cuisineFilter","typeFilter","tagFilter","priceFilter","scoreFilter","dateFilter"].forEach(id=>$("#"+id).value=""); $("#searchInput").value=""; $("#sortFilter").value="score-desc";
  const q=btn.dataset.quick; if(q==="elite") $("#scoreFilter").value="9"; else if(q==="recent") $("#sortFilter").value="recent"; else if(q==="date night"||q==="girls night") $("#tagFilter").value=q; else if(q==="sushi") $("#typeFilter").value="sushi";
  $$(".quick-chip").forEach(b=>b.classList.toggle("active",b===btn)); render();
}));
$("#exportBtn").addEventListener("click",()=>{
  if(!reviews.length){toast("Nothing to export yet");return;}
  const blob=new Blob([JSON.stringify(reviews,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tal-tastes-reviews.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
});
$("#reviewForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!validateStepOne()) {setStep(1);return;}
  const saveBtn=$("#saveBtn"); saveBtn.disabled=true; saveBtn.textContent="Saving...";
  try{
    const data=scoreDataFromForm();
    const photoUrl=await uploadPhotoToCloud();
    const item={
      id:editingReviewId || uuid(), created_at:(editingReviewId ? (reviews.find(r=>String(r.id)===String(editingReviewId))?.created_at || new Date().toISOString()) : new Date().toISOString()), name:data.name.trim(), venue_type:getVenueTypeFromForm(),
      cuisine:data.cuisine.trim(), area:data.area.trim(), price:data.price, visit_date:data.date||null,
      best_dish:data.bestDish?.trim()||null, tags:selectedTags(), photo_url:photoUrl,
      drive:+data.drive, parking:+data.parking, wait:+data.wait, welcome:+data.welcome, warmth:+data.warmth,
      knowledge:+data.knowledge, accuracy:+data.accuracy, timing:+data.timing, food:+data.food, freshness:+data.freshness,
      atmosphere:+data.atmosphere, noise:+data.noise, cleanliness:+data.cleanliness, value:+data.value, craving:+data.craving,
      recommend:data.recommend, choose_again:data.chooseAgain, notes:data.notes?.trim()||null
    };
    item.score=calcScore({...data,venueType:item.venue_type});
    const saved=await saveReview(item);
    if(editingReviewId) reviews=reviews.map(r=>String(r.id)===String(editingReviewId)?saved:r); else reviews.unshift(saved);
    const wasEditing=Boolean(editingReviewId); editingReviewId=null; render(); closeReview(); toast(wasEditing?`${item.name} updated ✓`:`${item.name} scored ${item.score.toFixed(1)} / 10`);
  }catch(err){console.error(err);toast(err?.message||"Could not save review");}
  finally{saveBtn.disabled=false;saveBtn.textContent="Save review";}
});

$("#loginBtn").addEventListener("click",tryLogin);
$("#loginPin").addEventListener("keydown",e=>{if(e.key==="Enter")tryLogin();});
$("#profileBtn").addEventListener("click",()=>{$("#profileModal").classList.add("open");$("#profileModal").setAttribute("aria-hidden","false");});
$("#closeProfile").addEventListener("click",()=>{$("#profileModal").classList.remove("open");$("#profileModal").setAttribute("aria-hidden","true");});
$("#profileModal").addEventListener("click",e=>{if(e.target.id==="profileModal")$("#closeProfile").click();});
$("#logoutBtn").addEventListener("click",logout);
loadCustomTags();
if(isAuthenticated()) hideLogin(); else showLogin();

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js?v=5.3").catch(err=>console.warn("SW",err)));
}
fetchReviews();
