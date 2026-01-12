import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";

export default function App() {
  const [step, setStep] = useState("profile");
  const [profile, setProfile] = useState("");
  const [barcode, setBarcode] = useState("");
  const [productName, setProductName] = useState("");
  const [variant, setVariant] = useState("");
  const [ingredients, setIngredients] = useState("");
  
  const [verdict, setVerdict] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [keyIngredient, setKeyIngredient] = useState(""); 
  const [explanation, setExplanation] = useState("");
  
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  const scannerRef = useRef(null);
  const stableCount = useRef(0);
  const lastCode = useRef(null);

  // Helper to talk to our new Backend
  const callGemini = async (prompt) => {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid server response");
  }

  if (!res.ok) {
    console.error("Backend error:", data);
    throw new Error(data?.error || "AI request failed");
  }

  if (!data?.result) {
    throw new Error("Empty AI response");
  }

  return data.result;
};

  useEffect(() => {
    if (step !== "scan") return;
    const startScanner = async () => {
      if (scannerRef.current) try { await scannerRef.current.stop(); } catch (e) {}
      const scanner = new Html5Qrcode("barcode-reader");
      scannerRef.current = scanner;
      try {
        const cams = await Html5Qrcode.getCameras();
        if (cams && cams.length > 0) {
          await scanner.start(
            cams[cams.length - 1].id,
            { fps: 10, qrbox: { width: 260, height: 160 }, formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.UPC_A] },
            async (code) => {
              if (!/^\d{8,13}$/.test(code)) return;
              if (code === lastCode.current) stableCount.current++;
              else { lastCode.current = code; stableCount.current = 1; }
              if (stableCount.current < 2) return;
              await scanner.stop(); scanner.clear();
              handleBarcodeFound(code);
            }
          );
        } else { alert("Camera not found"); }
      } catch (err) { console.error(err); }
    };
    startScanner();
    return () => { if (scannerRef.current?.isScanning) scannerRef.current.stop().catch(() => {}).then(() => scannerRef.current.clear()); };
  }, [step]);

  const handleBarcodeFound = async (code) => {
  setBarcode(code);
  setIsLoading(true);
  setLoadingMessage("Scanning Database...");

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${code}.json`
    );
    const data = await res.json();

    if (data.status === 1 && data.product) {
      const product = data.product;
      const name = product.product_name || "Unknown Product";
      setProductName(name);
      setVariant("");

      // ---------- FIX: Robust ingredient extraction ----------
      const extractedIngredients =
      product.ingredients_text ||
      product.ingredients_text_en ||
      product.ingredients_text_with_allergens ||
      product.ingredients_text_hi ||
      product.ingredients_text_fr ||
      (Array.isArray(product.ingredients)
      ? product.ingredients
        .map(i =>
          i.text ||
          i.text_en ||
          i.id ||
          i.label
        )
        .filter(Boolean)
        .join(", ")
    : "");

      if (extractedIngredients && extractedIngredients.trim()) {
        setIngredients(extractedIngredients);
        setStep("confirm");
      } else {
        await fetchIngredientsOnline(name, "");
      }
      // -------------------------------------------------------

    } else {
      setStep("manual");
    }
  } catch (e) {
    console.error("Food API error:", e);
    setStep("manual");
  } finally {
    setIsLoading(false);
  }
};

  const fetchIngredientsOnline = async (name, variantInput) => {
  setIsLoading(true);
  setLoadingMessage("AI Searching...");

  const fullName = variantInput ? `${name} ${variantInput}` : name;
  setProductName(fullName);

  try {
    const text = await callGemini(
      `Return comma-separated ingredients for "${fullName}". If unknown, return "NOT_FOUND".`
    );

    if (!text || text.includes("NOT_FOUND")) {
      setIngredients("");
      setStep("confirm");
      return;
    }

    setIngredients(text);
    setStep("confirm");

  } catch (e) {
    console.error("AI fetch failed:", e);
    setIngredients("");
    setStep("manual");
  } finally {
    setIsLoading(false);
  }
};

  const analyzeSafety = async () => {
    setIsLoading(true);
    setLoadingMessage("Analyzing Safety...");
    
    // ... (Your existing prompt variable logic is fine, keep it or copy from below) ...
    const prompt = `
      Act as a strict clinical nutritionist.
      User Profile: ${profile}
      Product: ${productName}
      Ingredients: ${ingredients}

      Task: Analyze strict safety.
      1. IGNORE "may contain" traces unless profile is Allergy.
      2. If UNSAFE, identify the specific ingredient causing it.
      
      Output strictly this JSON structure:
      {
        "verdict": "SAFE" or "UNSAFE" or "CAUTION",
        "risk_level": "Low" or "Medium" or "High",
        "key_ingredient": "Name of the bad ingredient (or 'None' if safe)",
        "explanation": "One simple sentence explaining why."
      }
    `;

    try {
      const text = await callGemini(prompt);
      
      // FIX 1: Don't just return! Throw an error so the "Caution" screen appears.
      if (!text) throw new Error("No response received from AI");

      // FIX 2: Clean the response
      const cleanJson = text.replace(/```json|```/g, '').trim();
      
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Invalid AI format");
      
      const json = JSON.parse(jsonMatch[0]);
      
      setVerdict(json.verdict.toUpperCase());
      setRiskLevel(json.risk_level);
      setKeyIngredient(json.key_ingredient);
      setExplanation(json.explanation);
      setStep("result");
      
    } catch (e) {
      console.error("Analysis Error:", e);
      // FIX 3: Force the Result screen to show "Caution" if anything fails
      setVerdict("CAUTION");
      setRiskLevel("Low");
      setKeyIngredient("Unknown");
      setExplanation("Could not finish analysis. Please verify ingredients manually.");
      setStep("result"); // <--- This ensures something ALWAYS pops up!
    } finally {
      setIsLoading(false);
    }
  };

  const getBgColor = () => {
    if (step !== "result") return "bg-slate-950";
    if (verdict === "SAFE") return "bg-slate-950";
    if (verdict === "CAUTION") return "bg-slate-950";
    return "bg-slate-950";
  };

  const profiles = [
    { value: "Diabetic", label: "Diabetic", icon: "🩸", desc: "Blood sugar monitoring" },
    { value: "Vegan", label: "Vegan", icon: "🌱", desc: "Plant-based diet" },
    { value: "Peanut Allergy", label: "Peanut Allergy", icon: "⚠️", desc: "Severe allergen" },
    { value: "Gluten Free", label: "Gluten Free", icon: "🌾", desc: "Celiac safe" },
    { value: "Lactose Intolerant", label: "Lactose Intolerant", icon: "🥛", desc: "Dairy restriction" }
  ];

  return (
    <div className={`min-h-screen ${getBgColor()} transition-colors duration-500 text-white flex items-center justify-center p-4`}>
      <div className="w-full max-w-lg">
        
        {isLoading && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-t-blue-400/30 rounded-full animate-spin" style={{animationDuration: '1.5s'}}></div>
            </div>
            <p className="mt-6 text-slate-300 text-sm font-medium tracking-wide">{loadingMessage}</p>
          </div>
        )}

        {/* PROFILE SELECTION */}
        {step === "profile" && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-3 pb-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-900/50 mb-2">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">NutriScope</h1>
              <p className="text-slate-400 text-sm font-medium">Clinical-Grade Safety Analysis</p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-6 shadow-2xl">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-white mb-1">Select Dietary Profile</h2>
                <p className="text-xs text-slate-500">Choose your restriction for personalized analysis</p>
              </div>

              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setProfile(p.value)}
                    className={`w-full text-left px-4 py-4 rounded-xl border transition-all duration-200 ${
                      profile === p.value
                        ? 'bg-blue-600/20 border-blue-500/50 shadow-lg shadow-blue-900/20'
                        : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                        profile === p.value ? 'bg-blue-600/30' : 'bg-slate-700/50'
                      }`}>
                        <span className="text-xl">{p.icon}</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm text-white">{p.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{p.desc}</div>
                      </div>
                      {profile === p.value && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={() => setStep("scan")} 
              disabled={!profile}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-700 disabled:to-slate-800 py-4 rounded-xl font-semibold text-white shadow-lg disabled:shadow-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to Scanner
            </button>
          </div>
        )}

        {/* SCANNER */}
        {step === "scan" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">Barcode Scanner</h2>
              <p className="text-sm text-slate-400">Align barcode within the frame</p>
            </div>

            <div className="relative bg-slate-900/50 backdrop-blur-xl rounded-2xl border-2 border-slate-800 p-4 shadow-2xl">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-600/10 to-transparent pointer-events-none"></div>
              <div id="barcode-reader" className="relative h-72 rounded-xl overflow-hidden bg-black border border-slate-700 shadow-inner"></div>
              <div className="absolute top-8 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-slate-950/80 backdrop-blur-sm rounded-full border border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-xs font-medium text-slate-300">Scanner Active</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span>EAN-13 / UPC-A</span>
              <span>Optimal: Bright Light</span>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setStep("manual")} 
                className="w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700 py-3.5 rounded-xl font-medium text-white transition-all duration-200"
              >
                Enter Product Manually
              </button>
              <button 
                onClick={() => setStep("profile")} 
                className="w-full text-slate-500 hover:text-slate-400 text-sm py-2 transition-colors"
              >
                Change Profile
              </button>
            </div>
          </div>
        )}

        {/* MANUAL ENTRY */}
        {step === "manual" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-white">Product Search</h2>
              <p className="text-sm text-slate-400">Enter product details manually</p>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Product Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Doritos Tortilla Chips" 
                  className="w-full bg-slate-800/60 border border-slate-700 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 px-4 py-3.5 rounded-xl text-white placeholder:text-slate-600 outline-none transition-all duration-200" 
                  value={productName} 
                  onChange={(e) => setProductName(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Variant (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g., Nacho Cheese" 
                  className="w-full bg-slate-800/60 border border-slate-700 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 px-4 py-3.5 rounded-xl text-white placeholder:text-slate-600 outline-none transition-all duration-200" 
                  value={variant} 
                  onChange={(e) => setVariant(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => fetchIngredientsOnline(productName, variant)} 
                disabled={!productName.trim()} 
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-700 disabled:to-slate-800 py-4 rounded-xl font-semibold text-white shadow-lg disabled:shadow-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Search Ingredients
              </button>
              <button 
                onClick={() => setStep("scan")} 
                className="w-full text-slate-500 hover:text-slate-400 text-sm py-2 transition-colors"
              >
                Back to Scanner
              </button>
            </div>
          </div>
        )}

        {/* CONFIRMATION */}
        {step === "confirm" && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-3 mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-green-600/20 border border-green-600/30 mb-2">
                <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">{productName}</h2>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                <span className="text-xs font-medium text-green-400">Ingredients Retrieved</span>
              </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-6 shadow-2xl">
              <label className="block text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">Ingredient List</label>
              <textarea 
                value={ingredients} 
                onChange={(e) => setIngredients(e.target.value)} 
                className="w-full h-40 bg-slate-800/60 border border-slate-700 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 px-4 py-3 rounded-xl text-sm text-slate-300 outline-none resize-none transition-all duration-200"
                placeholder="Ingredients will appear here..."
              />
            </div>

            <div className="space-y-3">
              <button 
                onClick={analyzeSafety} 
                disabled={!ingredients.trim()} 
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-700 disabled:to-slate-800 py-4 rounded-xl font-semibold text-white shadow-lg disabled:shadow-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Analyze Safety
              </button>
              <button 
                onClick={() => setStep("manual")} 
                className="w-full text-slate-500 hover:text-slate-400 text-sm py-2 transition-colors"
              >
                Edit Product Details
              </button>
            </div>
          </div>
        )}

        {/* RESULT */}
        {step === "result" && (
          <div className="space-y-5 animate-fade-in">
            {/* Verdict Card */}
            <div className={`relative overflow-hidden bg-slate-900/50 backdrop-blur-xl rounded-2xl border-2 p-6 shadow-2xl ${
              verdict === "SAFE" ? "border-green-600/50" :
              verdict === "CAUTION" ? "border-yellow-600/50" :
              "border-red-600/50"
            }`}>
              <div className={`absolute top-0 right-0 w-48 h-48 opacity-10 blur-3xl rounded-full ${
                verdict === "SAFE" ? "bg-green-600" :
                verdict === "CAUTION" ? "bg-yellow-600" :
                "bg-red-600"
              }`}></div>

              <div className="relative text-center">
                <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 ${
                  verdict === "SAFE" ? "bg-green-600/20 border-2 border-green-600/40" :
                  verdict === "CAUTION" ? "bg-yellow-600/20 border-2 border-yellow-600/40" :
                  "bg-red-600/20 border-2 border-red-600/40"
                }`}>
                  <span className={`text-4xl ${
                    verdict === "SAFE" ? "text-green-500" :
                    verdict === "CAUTION" ? "text-yellow-500" :
                    "text-red-500"
                  }`}>
                    {verdict === "SAFE" ? "✓" : verdict === "CAUTION" ? "⚠" : "✕"}
                  </span>
                </div>

                <h2 className={`text-4xl font-bold tracking-tight mb-2 ${
                  verdict === "SAFE" ? "text-green-500" :
                  verdict === "CAUTION" ? "text-yellow-500" :
                  "text-red-500"
                }`}>
                  {verdict}
                </h2>

                <p className="text-slate-400 text-sm font-medium mb-4 uppercase tracking-wider">{profile}</p>

                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-lg">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="text-xs font-medium text-slate-300">Powered by Gemini AI</span>
                </div>
              </div>
            </div>

            {/* Confidence Meter */}
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-800 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">AI Confidence Level</span>
                <span className="text-sm font-bold text-white">{riskLevel}</span>
              </div>
              <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                  riskLevel === "High" ? "w-full bg-gradient-to-r from-green-600 to-green-500" :
                  riskLevel === "Medium" ? "w-2/3 bg-gradient-to-r from-yellow-600 to-yellow-500" :
                  "w-1/3 bg-gradient-to-r from-red-600 to-red-500"
                }`}></div>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 p-4">
                <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Barcode</p>
                <p className="text-sm font-semibold text-white">{barcode || "Manual Entry"}</p>
              </div>
              <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 p-4">
                <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Risk Level</p>
                <p className="text-sm font-semibold text-white">{riskLevel}</p>
              </div>
            </div>

            {/* Analysis Details - Accordion */}
            <div className="space-y-2">
              <details className="group bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 overflow-hidden">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/40 transition-colors">
                  <span className="font-semibold text-white text-sm">Analysis Report</span>
                  <svg className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 pt-2 border-t border-slate-800 space-y-4">
                  {verdict !== "SAFE" && keyIngredient && keyIngredient !== "None" && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Flagged Ingredient</p>
                      <p className="text-base font-semibold text-red-400">{keyIngredient}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Explanation</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{explanation}</p>
                  </div>
                </div>
              </details>

              <details className="group bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 overflow-hidden">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/40 transition-colors">
                  <span className="font-semibold text-white text-sm">Full Ingredients</span>
                  <svg className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-5 pb-5 pt-2 border-t border-slate-800 max-h-48 overflow-y-auto">
                  <p className="text-xs text-slate-400 leading-relaxed">{ingredients}</p>
                </div>
              </details>

                            <details className="group bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800 overflow-hidden">
                              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-800/40 transition-colors">
                                <span className="font-semibold text-white text-sm">Edit & Re-analyze</span>
                                <svg className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </summary>
                              <div className="px-5 pb-5 pt-2 border-t border-slate-800">
                                <textarea 
                                  value={ingredients} 
                                  onChange={(e) => setIngredients(e.target.value)} 
                                  className="w-full h-32 bg-slate-800/60 border border-slate-700 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 px-4 py-3 rounded-xl text-sm text-slate-300 outline-none resize-none transition-all duration-200 mb-3"
                                  placeholder="Edit ingredients..."
                                />
                                <button 
                                  onClick={analyzeSafety} 
                                  disabled={!ingredients.trim()} 
                                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-700 disabled:to-slate-800 py-2 rounded-lg font-medium text-sm text-white shadow-lg disabled:shadow-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Re-analyze
                                </button>
                              </div>
                            </details>
                          </div>
              
                          {/* Action Buttons */}
                          <div className="space-y-3">
                            <button 
                              onClick={() => setStep("manual")} 
                              className="w-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700 py-3.5 rounded-xl font-medium text-white transition-all duration-200"
                            >
                              Scan Another Product
                            </button>
                            <button 
                              onClick={() => setStep("profile")} 
                              className="w-full text-slate-500 hover:text-slate-400 text-sm py-2 transition-colors"
                            >
                              Change Profile
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }