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

// ── Performance Monitoring ─────────────────────────────────────────────────
(function() {
  // Track page load time (Web Vitals)
  if (window.performance && window.performance.timing) {
    window.addEventListener('load', function() {
      setTimeout(function() {
        var timing = window.performance.timing;
        var loadTime = timing.loadEventEnd - timing.navigationStart;
        var dnsTime = timing.dnsLookupEnd - timing.dnsLookupStart;
        var connectTime = timing.connectEnd - timing.connectStart;
        var renderTime = timing.domContentLoadedEventEnd - timing.navigationStart;

        if (loadTime > 0 && loadTime < 60000) { // reasonable range
          gtag('event', 'page_load_time', {
            'total_ms': Math.round(loadTime),
            'dns_ms': Math.round(dnsTime),
            'connect_ms': Math.round(connectTime),
            'render_ms': Math.round(renderTime),
            'page_path': window.location.pathname
          });
        }
      }, 0);
    });
  }

  // Track Core Web Vitals if available (modern browsers)
  if ('PerformanceObserver' in window) {
    try {
      // Cumulative Layout Shift
      var clsValue = 0;
      var clsObserver = new PerformanceObserver(function(list) {
        for (var entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            gtag('event', 'cumulative_layout_shift', {
              'value': clsValue.toFixed(3),
              'page_path': window.location.pathname
            });
          }
        }
      });
      clsObserver.observe({entryTypes: ['layout-shift']});
    } catch(e) {}
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

// ── Churn & Subscription Analytics ───────────────────────────────────────
window.trackChurn = function(reason, plan) {
  gtag('event', 'subscription_cancel', {
    'reason': reason || 'unknown',
    'plan': plan || 'unknown',
    'event_category': 'conversion'
  });
};

window.trackTrialEvent = function(action, daysRemaining) {
  gtag('event', 'trial_' + action, {
    'action': action, // 'started', 'ending_soon', 'ended', 'converted'
    'days_remaining': daysRemaining || 0,
    'event_category': 'conversion'
  });
};

// ── Feature Usage Tracking ──────────────────────────────────────────────
window.trackProFeatureUsage = function(featureName, context) {
  gtag('event', 'pro_feature_used', {
    'feature_name': featureName,
    'context': context || 'app',
    'event_category': 'engagement'
  });
};

window.trackFeatureGated = function(featureName, action) {
  // Tracks when free users hit pro-only feature barriers
  gtag('event', 'feature_gated', {
    'feature_name': featureName,
    'action': action, // 'viewed', 'attempted_access', 'clicked_upgrade'
    'plan': 'free',
    'event_category': 'conversion'
  });
};

window.trackScenarioAction = function(action, scenarioData) {
  // Enhanced: now tracks save, restore, delete, duplicate, share, load, compare
  gtag('event', 'scenario_' + action, {
    'scenario_id': scenarioData && scenarioData.id ? scenarioData.id.substring(0, 8) : 'unknown',
    'scenario_count': (scenarioData && scenarioData.index) || 0,
    'scenario_name': (scenarioData && scenarioData.name) ? scenarioData.name.substring(0, 50) : 'unnamed',
    'event_category': 'engagement'
  });
};

// ── App Calculation Tracking ────────────────────────────────────────────
window.trackAppCalculationResult = function(resultData) {
  // Main app.html calculation results (purchase scenario)
  gtag('event', 'app_calculation_result', {
    'property_value': Math.round((resultData.propertyValue || 0) / 10000) * 10000,
    'loan_amount': Math.round((resultData.loanAmount || 0) / 10000) * 10000,
    'years_projected': resultData.yearsProjected || 30,
    'has_rental_income': !!resultData.rentalIncome,
    'has_renovation': !!resultData.renovationCost,
    'event_category': 'engagement'
  });
};

// ── API & Backend Error Tracking ────────────────────────────────────────
window.trackAPIError = function(apiName, errorType, statusCode) {
  gtag('event', 'api_error', {
    'api_name': apiName, // 'domain', 'rba', 'abs', 'address_suggest', 'auth', 'market_data'
    'error_type': errorType, // 'timeout', 'rate_limit', 'not_found', 'server_error', 'network'
    'status_code': statusCode || 0,
    'event_category': 'error'
  });
};

window.trackPerformanceIssue = function(metricName, value, threshold) {
  // Track when performance is degraded
  gtag('event', 'performance_issue', {
    'metric': metricName, // 'page_load_time', 'calculation_time', 'api_response_time'
    'value_ms': Math.round(value),
    'threshold_ms': threshold,
    'exceeded': value > threshold,
    'event_category': 'technical'
  });
};

// ── Account & Auth Tracking ────────────────────────────────────────────
window.trackAuthAction = function(action, result) {
  // Tracks password resets, email verification, account deletion, profile updates
  gtag('event', 'auth_action', {
    'action': action, // 'password_reset_requested', 'password_reset_confirmed', 'email_verified', 'account_deleted', 'profile_updated'
    'result': result, // 'success', 'failure', 'pending'
    'event_category': 'engagement'
  });
};

window.trackAccountAction = function(action, accountType) {
  // Tracks subscription/account changes
  gtag('event', 'account_action', {
    'action': action, // 'payment_method_updated', 'email_changed', 'settings_updated', 'two_factor_enabled'
    'account_type': accountType || 'unknown',
    'event_category': 'engagement'
  });
};

// ── Feature Discovery & Adoption ───────────────────────────────────────
window.trackFeatureDiscovery = function(featureName, section) {
  // Tracks first-time views of pro features
  gtag('event', 'feature_discovery', {
    'feature_name': featureName, // 'scenarios', 'pdf_export', 'multi_property', 'projections', 'comparison'
    'section': section || 'unknown', // 'app', 'sidebar', 'results', 'toolbar'
    'event_category': 'engagement'
  });
};

window.trackFeatureGateCTA = function(featureName, ctaType) {
  // Track clicks on 'Upgrade' CTAs from feature gates
  gtag('event', 'feature_gate_cta_click', {
    'feature_name': featureName,
    'cta_type': ctaType, // 'upgrade', 'learn_more', 'close'
    'event_category': 'conversion'
  });
};

// ── Help & Support Engagement ──────────────────────────────────────────
window.trackHelpEngagement = function(action, context) {
  gtag('event', 'help_engagement', {
    'action': action, // 'help_modal_opened', 'faq_clicked', 'support_contacted', 'video_watched', 'doc_viewed'
    'context': context || 'unknown', // 'app', 'scenario', 'calculation', 'feature'
    'event_category': 'engagement'
  });
};

// ── Free Trial Feature Usage ───────────────────────────────────────────
window.trackTrialFeatureUsage = function(featureName) {
  gtag('event', 'trial_feature_used', {
    'feature_name': featureName,
    'event_category': 'engagement'
  });
};

// ── Initialize on page load ──────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnalytics);
} else {
  initAnalytics();
}
