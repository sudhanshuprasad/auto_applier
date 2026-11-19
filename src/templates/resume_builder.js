// AutoApplier Resume Builder Bridge
// Synthesizes the final tailored File object from profile + AI tailoring

(() => {
  const ResumeBuilder = {
    generateResumeFile(profile, aiData) {
      if (!window.DocxBuilder) {
        throw new Error('DocxBuilder library not loaded.');
      }

      console.log('[AutoApplier] Generating ATS .docx file in-memory...');
      const blob = window.DocxBuilder.buildResumeBlob(profile, aiData);

      const fullName = (profile.personal && profile.personal.fullName) 
        ? profile.personal.fullName.trim() 
        : 'Applicant';

      const sanitizedName = fullName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${sanitizedName}_Resume_Tailored.docx`;

      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        lastModified: Date.now()
      });

      console.log(`[AutoApplier] Successfully generated ${fileName} (${file.size} bytes).`);
      return file;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResumeBuilder;
  } else {
    window.ResumeBuilder = ResumeBuilder;
  }
})();
