# 📊 EquitySight Tracking Guide

## Overview
Comprehensive GA4 tracking implementation covering all critical business metrics, user flows, and technical health indicators.

---

## 🎯 Business Metrics Tracked

### **Conversion Funnel**
| Event | Tracks | Location |
|-------|--------|----------|
| `sign_up` | Email signup completion | login.js |
| `login` | User login (email/Google) | login.js |
| `email_verified` | Email verification success/failure | login.js |
| `purchase` | Pro upgrade (via trackProUpgrade) | *wired in checkout* |

### **Churn & Retention**
| Event | Tracks | Location |
|-------|--------|----------|
| `subscription_cancel` | Plan cancellation, reason, plan type | account.js |
| `trial_ended` | Trial period expiration | *ready to wire* |
| `user_signout` | User logout | account.js |
| `account_deleted` | Account deletion success/failure | account.js |

### **Feature Adoption**
| Event | Tracks | Location |
|-------|--------|----------|
| `calculator_opened` | Free calculator page views | tools/*.js |
| `calculator_button_click` | User clicks calculate button | tools/*.js |
| `calculator_result` | Calculator produces result | tools/*.js |
| `app_calculation_result` | Main app calculation | app.js |
| `scenario_save` | Saves property scenario | app.js |
| `scenario_restore` | Loads saved scenario | app.js |
| `scenario_delete` | Deletes scenario | app.js |
| `scenario_share` | Shares scenario with user | app.js |
| `scenario_export` | Exports scenario (PDF) | app.js |
| `pdf_export` | PDF snapshot export | app.js |
| `pro_feature_used` | Uses pro-only feature | app.js |
| `feature_gated` | Free user hits pro barrier | app.js |
| `onboarding_shown` | First-run wizard shown | onboarding.js |
| `onboarding_step` | Advances a wizard step (`step`, `index`) | onboarding.js |
| `onboarding_skipped` | Skips the wizard (`step`, `index`) | onboarding.js |
| `onboarding_completed` | Finishes the wizard (`fields`) | onboarding.js |

### **Suburb Pages**
| Event | Tracks | Location |
|-------|--------|----------|
| `suburb_search` | Searches suburb by name/postcode | state-hub-search.js |
| `hub_show_more` | Clicks "Show more" on state hub | state-hub-search.js |
| `suburb_market_data_loaded` | Domain API data fetched | suburb-insights.js |
| `suburb_market_data_not_found` | No market data for suburb | suburb-insights.js |
| `suburb_market_data_error` | API error loading market data | suburb-insights.js |

---

## 🔍 Technical Metrics

### **API Health**
| Event | Tracks | Data |
|-------|--------|------|
| `api_error` | API call failures | api_name, error_type, status_code |
| | **error_type**: `timeout`, `rate_limit`, `not_found`, `server_error`, `network`, `http_error` | |
| | **api_name**: `address_suggest`, `domain`, `rba`, `auth`, `market_data`, `scenarios` | |

### **Performance**
| Event | Tracks | Data |
|-------|--------|------|
| `page_load_time` | Page load metrics | total_ms, dns_ms, connect_ms, render_ms |
| `page_time` | Time spent on page | time_seconds, page_path, page_title |
| `scroll_depth` | How far users scroll | depth_percent (25, 50, 75, 100) |
| `cumulative_layout_shift` | Layout stability (Core Web Vitals) | CLS value |

### **Error Tracking**
| Event | Tracks | Data |
|-------|--------|------|
| `exception` | JavaScript errors | description, source, line, column |

---

## 👤 User Segmentation

All events are automatically segmented by:
- **`user_plan`**: `free`, `pro`, `adviser`
- **`user_authenticated`**: `true`, `false`
- **`user_id`**: Session ID (if authenticated)
- **`user_email`**: Email (if authenticated)

This enables filtering GA4 reports by:
- Free vs Pro users
- Authenticated vs anonymous users
- Device type
- Browser/OS (automatic)
- Location (automatic)

---

## 📱 Authentication Tracking

| Event | Tracks | Location |
|-------|--------|----------|
| `password_reset_requested` | User initiates password reset | login.js |
| `password_reset_confirmed` | Password reset success/failure | login.js |
| `email_verified` | Email verification (signup flow) | login.js |
| `account_action` | Account updates, 2FA, etc | account.js |

---

## 📊 GA4 Report Examples

### **1. Conversion Funnel**
```
Explore > Funnel Analysis
Steps: sign_up → email_verified → purchase
Filter: free users over 30 days
Shows: Where free users drop off, which paths convert best
```

### **2. Churn Analysis**
```
Reports > User Demographics
Event: subscription_cancel
Breakdown by: reason, plan, user_plan, date
Shows: Why users cancel, when, which plans churn most
```

### **3. Feature Adoption**
```
Explore > Funnel
Steps: app_calculation_result → feature_gated → pro_feature_used → purchase
Shows: Which features drive conversions, when users upgrade
```

### **4. API Reliability**
```
Reports > Real-time
Event: api_error
Breakdown by: api_name, error_type, status_code
Filter: date, hour
Shows: Which APIs fail, how often, when
```

### **5. Performance**
```
Explore > Cohort
Group by: page_load_time (ranges: <1s, 1-3s, 3-5s, >5s)
Compare: bounce_rate, scroll_depth, conversion_rate
Shows: Performance impact on engagement
```

### **6. Suburb Pages**
```
Reports > Events
Event: suburb_search
Breakdown by: search_query, results_count, user_plan
Shows: Popular suburbs, search trends, conversion patterns
```

### **7. Free vs Pro Usage**
```
Explore > User Lifetime Value
Filter: user_plan = 'free'
Breakdown by: pro_feature_used, feature_gated, purchase
Shows: Which features drive upgrades, user journey to conversion
```

---

## 🚨 Key Alerts to Set Up

1. **API Errors Spike**
   - Condition: api_error count > 10/hour
   - Action: Investigate which API is failing

2. **Rate Limit Hit**
   - Condition: api_error where error_type = 'rate_limit'
   - Action: Implement backoff or increase quota

3. **Page Load Slow**
   - Condition: page_load_time > 5000ms
   - Action: Performance optimization needed

4. **Churn Spike**
   - Condition: subscription_cancel > daily average
   - Action: Investigate why, re-engagement campaign

5. **Auth Flow Broken**
   - Condition: email_verified failure rate > 5%
   - Action: Check email service, verify endpoint

---

## 📈 Dashboard Recommendations

Create custom GA4 dashboard with cards for:

**Daily Metrics:**
- Sign-ups (free vs all)
- Pro upgrades
- API error count
- Page load time (p50, p95)
- Churn count

**Weekly Metrics:**
- Free → Pro conversion rate
- Top 10 searched suburbs
- Feature_gated count (free users hitting barriers)
- Scenario save/restore ratio
- Suburb page bounce rate

**Trending:**
- Conversion funnel (sign_up → purchase)
- API error trend
- Performance trend
- Suburb search volume trend

---

## 🔧 Implementation Details

### Files Modified:
- `analytics.js` - Core tracking functions
- `app.js` - Main app events (calculations, scenarios, API errors)
- `app-events.js` - Event listener wiring
- `account.js` - Account/churn events
- `login.js` - Auth flow events
- `tools/*.js` - Calculator events
- `state-hub-search.js` - Suburb search events
- `suburb-insights.js` - Market data tracking

### Tracking Functions Added:
```javascript
// Business metrics
trackChurn(reason, plan)
trackSignup(method)
trackLogin(method)
trackProUpgrade(plan)
trackScenarioAction(action, data)  // save, restore, delete, share, export
trackProFeatureUsage(featureName, context)
trackFeatureGated(featureName, action)
trackAuthAction(action, result)  // password reset, email verify, delete

// Technical metrics
trackAPIError(apiName, errorType, statusCode)
trackPerformanceIssue(metricName, value, threshold)
trackAppCalculationResult(resultData)

// Events
trackPageEvent(eventName, eventData)  // Generic event tracker
```

---

## ✅ User Privacy

- **No personally identifying information** in event data (except session ID)
- **Numeric values rounded** to privacy-safe ranges (property prices to nearest 10k)
- **Email only tracked in user properties** (not in individual events)
- **All data sent to Google Analytics 4** (subject to GA4 privacy policy)
- **GDPR/CCPA compliant** (respects user consent signals)

---

## 🎯 Next Steps

1. **Verify GA4 property is linked** in Google Search Console
2. **Create custom dashboard** with key metrics above
3. **Set up email alerts** for critical events
4. **Run conversion funnel analysis** to identify drop-off points
5. **Analyze suburb search trends** to prioritize content
6. **Monitor API errors** for reliability issues
7. **Track feature adoption** to inform roadmap decisions

---

## 📞 Questions?

For tracking questions:
- Check GA4 Real-time report to see events firing live
- Use GA4 Explore to custom-analyze event data
- Set up Data Studio dashboards for automated reporting
- Archive historical data to BigQuery for long-term analysis
