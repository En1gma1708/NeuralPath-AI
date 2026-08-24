import json
import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from dotenv import load_dotenv

from retriever import retriever

# Load .env variables
load_dotenv()

# Phase 2c external-validation numbers (2026-08-23 retrain) - real, measured
# numbers from model/eval_external_validation.py, traceable to
# docs/METRICS.md's "Retrain with additional pituitary training data"
# section. Not a live lookup (the eval script runs offline against a local
# dataset, not something the deployed backend can query at request time),
# so this is a hardcoded snapshot - update it by hand if a future retrain
# changes these numbers, same as METRICS.md itself.
EXTERNAL_VALIDATION_STATS = {
    "description": (
        "Accuracy measured on a composite external-validation set (4 "
        "independently-sourced collections, ~1,049 images total, one per "
        "class) - MRI scans from different hospitals/scanners than the "
        "model's training data, to test real-world generalization rather "
        "than in-distribution performance."
    ),
    "in_distribution_test_accuracy_pct": 94.88,
    "external_accuracy_pct": 72.83,
    "generalization_gap_points": 21.59,
    "per_class_external_recall_pct": {
        "glioma": 55, "meningioma": 51, "notumor": 99, "pituitary": 100,
    },
    "notes": (
        "External accuracy is meaningfully lower than in-distribution test "
        "accuracy - this model performs worse on scans from hospitals/"
        "scanners it wasn't trained on than the headline accuracy number "
        "alone suggests. Meningioma has the weakest external recall (51%)."
    ),
}


@tool
def get_uncertainty_details(entropy: float, level: str) -> str:
    """Explains what a specific MC-Dropout predictive-entropy value and
    uncertainty level actually mean for THIS scan's prediction, grounded in
    the real thresholds/numbers this model was calibrated against. Call
    this when the user asks how confident/certain/reliable the AI really
    is, or questions the trustworthiness of the result - not for general
    questions about the medical condition itself."""
    if level == "high":
        explanation = (
            f"This prediction's uncertainty is HIGH (predictive entropy "
            f"{entropy:.3f}, estimated via 30 stochastic MC-Dropout "
            f"forward passes). On this model's held-out test set, correct "
            f"predictions average ~0.077 entropy and incorrect ones "
            f"average ~0.554 - {entropy:.3f} sits in the range more "
            f"associated with errors than correct calls. This model "
            f"recognizes only 4 categories, so a scan showing something "
            f"outside those 4 (or genuinely ambiguous/borderline imaging) "
            f"can produce a high-confidence-looking prediction that is "
            f"still unreliable. Treat this result as inconclusive pending "
            f"radiologist review."
        )
    elif level == "medium":
        explanation = (
            f"This prediction's uncertainty is MEDIUM (predictive entropy "
            f"{entropy:.3f}). Not as reliable as a low-uncertainty call, "
            f"but not in the range most associated with outright errors "
            f"either. Clinical correlation is still recommended."
        )
    else:
        explanation = (
            f"This prediction's uncertainty is LOW (predictive entropy "
            f"{entropy:.3f}), consistent with this model's correct "
            f"predictions on its held-out test set (which average ~0.077 "
            f"entropy). This is the model's most confident regime, though "
            f"it does not replace clinical review."
        )
    return explanation


@tool
def retrieve_medical_reference(query: str) -> str:
    """Searches a curated medical reference corpus (StatPearls/NCBI,
    RadiologyInfo.org) for passages relevant to a clinical/medical
    question - e.g. what a condition is, typical presentation, imaging
    appearance. Call this for questions about the medical condition itself
    (glioma, meningioma, pituitary tumor, or normal/no-tumor findings),
    not for questions about the AI model's confidence or accuracy."""
    results = retriever.retrieve(query, top_k=3)
    if not results:
        return "No relevant passages found in the reference corpus for this query."
    return "\n\n".join(
        f"[Source: {c['source']}, section \"{c['heading']}\"]\n{c['text']}"
        for c in results
    )


@tool
def get_external_validation_stats() -> str:
    """Returns this model's REAL, measured accuracy on external data from
    hospitals/scanners outside its training set, versus its in-distribution
    (training-lineage) held-out test accuracy. Call this when the user
    asks whether the AI would work as well elsewhere, on a different
    hospital's scans, in the real world, or questions whether the reported
    accuracy is representative/trustworthy in general (as opposed to
    asking about uncertainty on their specific scan - use
    get_uncertainty_details for that instead)."""
    return json.dumps(EXTERNAL_VALIDATION_STATS, indent=2)


CHAT_TOOLS = [get_uncertainty_details, retrieve_medical_reference, get_external_validation_stats]
TOOLS_BY_NAME = {t.name: t for t in CHAT_TOOLS}

def generate_medical_report(prediction: str, confidence: float, summary: str):
    template = """You are an expert Neuroradiologist AI. 
Generate a comprehensive, formal Neuroradiology Report based on the MRI scan analysis provided below.

Strictly format your response using standard Medical/Radiological Reporting structure using Markdown. 
Use ## for headings, ** for bold, * for italics, and - for bullet points. Ensure there are clear blank lines between sections.

INPUT DATA:
- Primary Finding (Classification): {prediction}
- AI Diagnostic Confidence: {confidence}%
- Brief Summary: {summary}

REQUIRED REPORT STRUCTURE:
## NEURORADIOLOGY REPORT

**Patient Demographics:** [Anonymized / Not Provided]
**Date of Exam:** [Current Date]
**Exam Type:** MRI Brain w/o IV Contrast

### CLINICAL INDICATION
*Patient presented for evaluation of suspected intracranial pathology. AI screening protocol activated.*

### TECHNIQUE
*Automated Deep Learning (VGG-16/CNN) Diagnostic Screening of MRI Brain.*

### FINDINGS
(Provide a detailed, professional paragraph explaining the typical radiological appearance of the detected {prediction}. Use bold for key terms.)

### IMPRESSION
1. **{prediction}**: (State the primary finding and the AI confidence of {confidence}%).
2. (Add a bullet point about typical clinical significance or symptoms).
3. (Add a bullet point recommending clinical correlation or further imaging).

---
*Disclaimer: This report is generated by NeuralPath AI as an assistive screening tool and does not constitute a final medical diagnosis. Clinical correlation by a certified radiologist is required.*
"""
    
    prompt = ChatPromptTemplate.from_template(template)
    
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return "Error: GROQ_API_KEY is not set in the backend environment. Cannot generate report."
    
    try:
        model = ChatGroq(model="openai/gpt-oss-20b", groq_api_key=api_key)
        chain = prompt | model
        
        ans = chain.invoke({
            "prediction": prediction,
            "confidence": f"{confidence:.2f}",
            "summary": summary
        })
        return ans.content
    except Exception as e:
        return f"Error generating report: {str(e)}"


def radiologist_chat(message: str, prediction: str, confidence: float, probabilities: dict,
                      chat_history: list, uncertainty: dict | None = None):
    """Phase 2d: tool-calling chat. The model decides per-message whether to
    call get_uncertainty_details (this scan's real entropy/level),
    retrieve_medical_reference (Phase 2b's corpus, now on-demand instead of
    always-on), get_external_validation_stats (Phase 2c's real generalization
    numbers), some combination, or none - rather than this function always
    retrieving regardless of whether the question needs it (the old Phase 2b
    behavior)."""
    uncertainty_context = (
        f"- Uncertainty: entropy={uncertainty['predictive_entropy']:.3f}, "
        f"level={uncertainty['level']} (call get_uncertainty_details with "
        f"these exact values if the user asks how reliable/confident this "
        f"result really is)"
        if uncertainty else
        "- Uncertainty: not available for this prediction"
    )

    system_prompt = f"""You are Dr. NeuralPath, an expert AI Neuroradiologist assistant.
You are helping a user understand their brain MRI scan results. Be professional, empathetic, and clear.

SCAN CONTEXT (always reference this when relevant):
- Classification: {prediction}
- AI Confidence: {confidence:.1f}%
- Probability Breakdown: {', '.join(f'{k}: {v:.1f}%' for k, v in probabilities.items())}
{uncertainty_context}

TOOLS: you have 3 tools available - get_uncertainty_details (this scan's
real confidence reliability), retrieve_medical_reference (sourced medical
reference material on the condition itself), and
get_external_validation_stats (this model's real accuracy on outside data).
Call whichever tool(s) the user's question actually needs; call none if the
question doesn't need grounding (e.g. small talk, or something already
fully answered by the SCAN CONTEXT above). When you use a tool's result,
mention its source briefly (e.g. "per clinical reference material..." or
"based on this model's measured external-validation accuracy...").

RULES:
- Answer questions about the scan results, brain conditions, next steps, and general neuroradiology.
- Always remind the user this is AI-assisted analysis and they should consult a real physician.
- Be concise (2-4 paragraphs max). Use simple language a patient can understand.
- If asked something completely unrelated to medicine, politely redirect.
- Never make a definitive diagnosis. Use phrases like "the AI screening suggests" or "this may indicate".
- Never invent a tool result or a citation - only cite what a tool actually returned.
"""

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return "I'm sorry, the AI service is not configured. Please contact support."

    try:
        model = ChatGroq(model="openai/gpt-oss-20b", groq_api_key=api_key)
        model_with_tools = model.bind_tools(CHAT_TOOLS)

        from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
        messages = [SystemMessage(content=system_prompt)]

        for msg in chat_history[-10:]:  # Keep last 10 messages for context
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            else:
                messages.append(AIMessage(content=msg["content"]))

        messages.append(HumanMessage(content=message))

        response = model_with_tools.invoke(messages)

        # Tool-calling loop: at most one round-trip - the 3 tools here are
        # all simple, single-purpose lookups with no reason to chain further
        # calls off each other's results.
        if response.tool_calls:
            messages.append(response)
            for call in response.tool_calls:
                tool_fn = TOOLS_BY_NAME.get(call["name"])
                if tool_fn is None:
                    result = f"Unknown tool: {call['name']}"
                else:
                    result = tool_fn.invoke(call["args"])
                messages.append(ToolMessage(content=str(result), tool_call_id=call["id"]))
            response = model_with_tools.invoke(messages)

        return response.content
    except Exception as e:
        return f"I encountered an error processing your question. Please try again. ({str(e)})"
