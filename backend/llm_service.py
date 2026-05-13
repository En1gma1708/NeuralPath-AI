import os
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from dotenv import load_dotenv

# Load .env variables
load_dotenv()

def generate_medical_report(prediction: str, confidence: float, summary: str):
    template = """You are a highly advanced AI medical assistant specializing in neuroradiology.
Based on the following MRI scan analysis, generate a comprehensive, professional medical insight report.
Do not provide a definitive diagnosis, but rather clinical insights, typical symptoms, and recommended next steps for a physician.

Analysis Details:
- Classification: {prediction}
- Confidence: {confidence}%
- Brief Summary: {summary}

Structure the report clearly with headings. Use a clinical yet clear tone."""
    
    prompt = ChatPromptTemplate.from_template(template)
    
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return "Error: GROQ_API_KEY is not set in the backend environment. Cannot generate report."
    
    try:
        model = ChatGroq(model="llama-3.1-8b-instant", groq_api_key=api_key)
        chain = prompt | model
        
        ans = chain.invoke({
            "prediction": prediction,
            "confidence": f"{confidence:.2f}",
            "summary": summary
        })
        return ans.content
    except Exception as e:
        return f"Error generating report: {str(e)}"
