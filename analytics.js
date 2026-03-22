// analytics.js — Enhanced Google Analytics 4 tracking
// Provides calculator interaction, conversion, and user behavior tracking
// Call gtag() functions from this file to log structured events

// ── Initialize custom user properties ─────────────────────────────────────
function initAnalytics() {
  // Set user ID if authenticated (for cross-device tracking)
  var session = getSession && getSession();
  if (session && session.id) {
    gtag('config', 'G-TYQXT24670', {
      'user_id': session.id,
      'user_email': session.email || null
    });

    // Custom user properties
    gtag('set', {
      'user_plan': session.plan || 'free',
      'user_authenticated': true
    });
  } else {
    gtag('set', {
      'user_plan': 'free',
      'user_authenticated': false
    });
  }
}

// ── Calculator Interactions ──────────────────────────────────────────────
window.trackCalculatorStart = function(calculatorName) {
  gtag('event', 'calculator_opened', {
    'calculator_name': calculatorName,
    'timestamp': new Date().toISOString()
  });
};

window.trackCalculatorInteraction = function(calculatorName, fieldName, fieldValue) {
  // Round numeric values for privacy (e.g., property price to nearest 10k)
  var sanitizedValue = fieldValue;
  if (typeof fieldValue === 'number' && fieldValue > 10000) {
    sanitizedValue = Math.round(fieldValue / 10000) * 10000;
  }

  gtag('event', 'calculator_interaction', {
    'calculator_name': calculatorName,
    'field_name': fieldName,
    'field_type': typeof fieldValue,
    'value_rounded': sanitizedValue
  });
};

window.trackCalculatorResult = function(calculatorName, resultData) {
  // Track when user gets a result (calculation complete)
  var sanitizedData = {};

  // Sanitize numeric results (round to privacy-safe values)
  Object.keys(resultData || {}).forEach(function(key) {
    var val = resultData[key];
    if (typeof val === 'number' && val > 10000) {
      sanitizedData[key] = Math.round(val / 10000) * 10000;
    } else if (typeof val === 'number') {
      sanitizedData[key] = Math.round(val);
    } else {
      sanitizedData[key] = val;
    }
  });

  gtag('event', 'calculator_result', {
    'calculator_name': calculatorName,
    'result_count': Object.keys(resultData || {}).length,
    'event_category': 'calculator'
  });
};

// ── Conversion Tracking ──────────────────────────────────────────────────
window.trackProUpgrade = function(plan) {
  gtag('event', 'purchase', {
    'value': plan === 'pro' ? 4.99 : 0,
    'currency': 'AUD',
    'transaction_id': 'upgrade_' + Date.now(),
    'plan_type': plan,
    'event_category': 'conversion'
  });

  gtag('event', 'upgrade_to_pro', {
    'plan': plan
  });
};

window.trackPDFExport = function(pageContext) {
  gtag('event', 'pdf_export', {
    'page_context': pageContext || 'app',
    'event_category': 'conversion'
  });
};

window.trackScenarioAction = function(action, scenarioData) {
  // Track scenario save, restore, delete, duplicate
  gtag('event', 'scenario_' + action, {
    'scenario_id': scenarioData && scenarioData.id ? scenarioData.id.substring(0, 8) : 'unknown',
    'scenario_count': (scenarioData && scenarioData.index) || 0,
    'event_category': 'engagement'
  });
};

window.trackSignup = function(method) {
  // Track account creation (method: email, google, etc)
  gtag('event', 'sign_up', {
    'signup_method': method || 'email',
    'event_category': 'conversion'
  });
};

window.trackLogin = function(method) {
  // Track login
  gtag('event', 'login', {
    'login_method': method || 'email',
    'event_category': 'engagement'
  });
};

// ── Feature Usage Tracking ───────────────────────────────────────────────
window.trackTabNavigation = function(tabName) {
  gtag('event', 'tab_click', {
    'tab_name': tabName,
    'page_path': window.location.pathname
  });
};

window.trackFormSubmission = function(formName, success) {
  gtag('event', 'form_submit', {
    'form_name': formName,
    'success': success === true,
    'event_category': 'engagement'
  });
};

window.trackSidebarToggle = function(action) {
  // Track mobile sidebar open/close
  gtag('event', 'sidebar_toggle', {
    'action': action, // 'open' or 'close'
    'device_type': window.innerWidth <= 600 ? 'mobile' : 'desktop'
  });
};

window.trackPhotoUpload = function(success) {
  gtag('event', 'photo_upload', {
    'success': success === true,
    'event_category': 'engagement'
  });
};

// ── Page-Level Tracking ──────────────────────────────────────────────────
window.trackPageEvent = function(eventName, eventData) {
  // Generic event tracker for page-specific events
  gtag('event', eventName, eventData || {});
};

// ── Scroll Depth Tracking ────────────────────────────────────────────────
(function() {
  var scrollDepths = {25: false, 50: false, 75: false, 100: false};
  var trackScrollDepth = function() {
    var winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    var docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrollPercent = docHeight > 0 ? (winScroll / docHeight) * 100 : 0;

    [25, 50, 75, 100].forEach(function(depth) {
      if (scrollPercent >= depth && !scrollDepths[depth]) {
        scrollDepths[depth] = true;
        gtag('event', 'scroll_depth', {
          'depth_percent': depth,
          'page_path': window.location.pathname
        });
      }
    });
  };

  window.addEventListener('scroll', trackScrollDepth, {passive: true});
})();

// ── Time on Page Tracking ────────────────────────────────────────────────
(function() {
  var startTime = Date.now();
  window.addEventListener('beforeunload', function() {
    var timeOnPage = Math.round((Date.now() - startTime) / 1000);
    if (timeOnPage > 3) { // Only track if more than 3 seconds
      gtag('event', 'page_time', {
        'time_seconds': timeOnPage,
        'page_path': window.location.pathname,
        'page_title': document.title
      });
    }
  });
})();

// ── Tool/Calculator Page Tracking ────────────────────────────────────────
(function() {
  var path = window.location.pathname;
  var isToolPage = path.includes('/tools/') || path.includes('.html');

  if (isToolPage) {
    gtag('event', 'view_item', {
      'items': [{
        'item_name': document.title,
        'item_category': 'calculator'
      }]
    });
  }
})();

// ── Error Tracking Integration ───────────────────────────────────────────
window.trackJSError = function(errorMessage, source, lineno, colno) {
  gtag('event', 'exception', {
    'description': errorMessage,
    'source': source,
    'line': lineno,
    'column': colno,
    'event_category': 'error'
  });
};

// ── Session Analytics ────────────────────────────────────────────────────
// Track key session changes automatically
window.addEventListener('storage', function(e) {
  if (e.key === 'propCalc_session_v1') {
    // Session changed (login/logout/plan update)
    if (!e.newValue && e.oldValue) {
      // Session was cleared (logout)
      gtag('event', 'logout', {
        'event_category': 'engagement'
      });
    } else if (e.newValue && !e.oldValue) {
      // Session created (login)
      gtag('event', 'login', {
        'login_method': 'restored'
      });
    }
  }
});

// ── Initialize on page load ──────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
  initAnalytics();
}
