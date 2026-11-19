// AutoApplier ATS Rules & Platform Selectors

const AtsRules = {
  // Known ATS platform detectors
  detectPlatform(url) {
    const u = url.toLowerCase();
    if (u.includes('greenhouse.io') || u.includes('grnhse.io')) return 'greenhouse';
    if (u.includes('lever.co')) return 'lever';
    if (u.includes('myworkdayjobs.com')) return 'workday';
    if (u.includes('ashbyhq.com')) return 'ashby';
    if (u.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (u.includes('icims.com')) return 'icims';
    if (u.includes('taleo.net')) return 'taleo';
    return 'generic';
  },

  // Job description selectors by platform
  jdSelectors: {
    greenhouse: [
      '#content',
      '#app-body',
      '.job-description',
      '#job-description',
      '.body'
    ],
    lever: [
      '.section-wrapper.accent-sections',
      '.posting-headline ~ .section-wrapper',
      '.content',
      '.section-wrapper'
    ],
    workday: [
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="job-posting-details"]',
      '.job-description'
    ],
    ashby: [
      '.ashby-job-posting-description',
      '[class*="JobPostingDescription"]',
      '#job-description'
    ],
    smartrecruiters: [
      '.job-detail',
      '#job-details',
      '.job-sections'
    ],
    generic: [
      'article',
      '[role="main"]',
      'main',
      '.job-description',
      '#job-description',
      '.description',
      '.posting-description',
      '.careers-job-details'
    ]
  },

  // Job title selectors by platform
  titleSelectors: {
    greenhouse: ['.app-title', '.job-title', 'h1'],
    lever: ['.posting-headline h2', 'h2', 'h1'],
    workday: ['[data-automation-id="jobPostingHeader"]', 'h2', 'h1'],
    ashby: ['h1', '[class*="JobTitle"]'],
    generic: ['h1', 'h2.job-title', '.job-title']
  },

  // Company selectors
  companySelectors: {
    greenhouse: ['.company-name', '.company'],
    lever: ['.main-header-logo', '.posting-headline .company'],
    workday: ['[data-automation-id="companyName"]'],
    ashby: ['[class*="OrganizationName"]'],
    generic: ['.company-name', '.employer', '.company']
  },

  // Field semantic patterns (maps labels/names to standard semantic keys)
  fieldPatterns: {
    firstName: [/first\s*name/i, /given\s*name/i, /^fname$/i, /^first$/i],
    lastName: [/last\s*name/i, /surname/i, /family\s*name/i, /^lname$/i, /^last$/i],
    fullName: [/full\s*name/i, /^name$/i, /applicant\s*name/i, /your\s*name/i],
    email: [/e-?mail/i, /^email_address$/i],
    phone: [/phone/i, /mobile/i, /cell/i, /telephone/i, /contact\s*number/i],
    location: [/location/i, /city/i, /address/i, /where\s*are\s*you\s*based/i, /country/i],
    linkedin: [/linkedin/i, /linked-in/i],
    github: [/github/i, /git\s*profile/i],
    portfolio: [/portfolio/i, /website/i, /personal\s*site/i, /personal\s*url/i],
    resumeFile: [/resume/i, /cv/i, /curriculum\s*vitae/i, /attach\s*resume/i],
    coverLetterFile: [/cover\s*letter/i],
    workAuth: [/authorized\s*to\s*work/i, /legally\s*authorized/i, /work\s*authorization/i, /eligible\s*to\s*work/i],
    sponsorship: [/require\s*sponsorship/i, /visa\s*sponsorship/i, /future\s*sponsorship/i, /need\s*sponsorship/i],
    salary: [/salary/i, /compensation/i, /desired\s*pay/i, /expected\s*pay/i, /expected\s*compensation/i],
    notice: [/notice\s*period/i, /availability/i, /how\s*soon/i, /start\s*date/i],
    veteran: [/veteran/i, /military/i],
    disability: [/disability/i, /handicap/i, /physical\s*condition/i],
    gender: [/gender/i, /sex/i],
    race: [/race/i, /ethnicity/i, /hispanic/i]
  },

  // Match a label text to a known semantic field
  matchSemanticField(text) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    for (const [key, patterns] of Object.entries(this.fieldPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(clean)) {
          return key;
        }
      }
    }
    return null;
  }
};

// Export for usage in both content scripts and service workers
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AtsRules;
} else {
  window.AtsRules = AtsRules;
}
