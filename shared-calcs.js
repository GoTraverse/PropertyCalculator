/**
 * shared-calcs.js
 * Common utility functions used across all calculators
 * Reduces duplication and ensures consistent formatting/parsing
 */

/**
 * Format number to currency (AUD) with 2 decimal places
 * fmtNum(12345.678) => "$12,345.68"
 * fmtNum(0) => "$0.00"
 */
function fmtNum(n) {
  if (isNaN(n)) return '$0.00';
  const rounded = Math.round(n * 100) / 100;
  return '$' + rounded.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format number with commas (no dollar sign)
 * fmt(12345.678) => "12,345.68"
 * fmt(1000000) => "1,000,000.00"
 */
function fmt(n) {
  if (isNaN(n)) return '0.00';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format as integer with commas (no decimal places)
 * fmtInt(12345.678) => "12,346" (rounded)
 */
function fmtInt(n) {
  if (isNaN(n)) return '0';
  const rounded = Math.round(n);
  return rounded.toLocaleString('en-AU');
}

/**
 * Parse user input string to number
 * Handles "$", "," and spaces
 * parseNum("$12,345.67") => 12345.67
 * parseNum("12345") => 12345
 * parseNum("") => 0
 */
function parseNum(s) {
  if (!s || s === '') return 0;
  const cleaned = s.replace(/[\$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format percentage to 1 decimal place
 * fmtPercent(0.0567) => "5.7%"
 * fmtPercent(0.15) => "15.0%"
 */
function fmtPercent(decimal) {
  if (isNaN(decimal)) return '0.0%';
  const percent = decimal * 100;
  return (Math.round(percent * 10) / 10).toFixed(1) + '%';
}

/**
 * Calculate LVR (Loan-to-Value Ratio)
 * lvr(800000, 600000) => 0.75 (75%)
 * lvr(800000, 0) => 0
 */
function calcLVR(loanAmount, propertyValue) {
  if (propertyValue <= 0) return 0;
  return loanAmount / propertyValue;
}

/**
 * Calculate monthly repayment using standard mortgage formula
 * monthlyRepayment(loanAmount, annualRate, yearsRemaining)
 * monthlyRepayment(400000, 0.06, 30) => monthly payment amount
 */
function monthlyRepayment(principal, annualRate, years) {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;

  if (monthlyRate === 0) {
    return principal / numPayments;
  }

  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments);
  const denominator = Math.pow(1 + monthlyRate, numPayments) - 1;
  return numerator / denominator;
}

/**
 * Calculate total interest paid over loan term
 * totalInterest(loanAmount, monthlyPayment, yearsRemaining)
 */
function totalInterest(principal, monthlyPayment, years) {
  return (monthlyPayment * years * 12) - principal;
}

/**
 * Calculate gross rental yield
 * grossYield(weeklyRent, propertyValue)
 * grossYield(500, 750000) => 0.0346 (3.46%)
 */
function grossYield(weeklyRent, propertyValue) {
  if (propertyValue <= 0) return 0;
  const annualRent = weeklyRent * 52;
  return annualRent / propertyValue;
}

/**
 * Calculate net rental yield
 * netYield(weeklyRent, annualExpenses, propertyValue)
 */
function netYield(weeklyRent, annualExpenses, propertyValue) {
  if (propertyValue <= 0) return 0;
  const annualRent = weeklyRent * 52;
  const netIncome = annualRent - annualExpenses;
  return netIncome / propertyValue;
}

/**
 * Calculate compound growth over years
 * compoundGrowth(startValue, annualRate, years)
 * compoundGrowth(500000, 0.04, 30) => future value
 */
function compoundGrowth(startValue, annualRate, years) {
  return startValue * Math.pow(1 + annualRate, years);
}

/**
 * Calculate equity growth from repayment
 * equityFromRepayment(loanAmount, monthlyPayment, monthsElapsed)
 */
function equityFromRepayment(principal, monthlyPayment, monthsElapsed, annualRate) {
  let balance = principal;
  let principalPaid = 0;
  const monthlyRate = annualRate / 12;

  for (let i = 0; i < monthsElapsed && balance > 0; i++) {
    const interestPaid = balance * monthlyRate;
    const principalThisMonth = monthlyPayment - interestPaid;

    if (principalThisMonth > 0) {
      principalPaid += principalThisMonth;
      balance -= principalThisMonth;
    }
  }

  return principalPaid;
}

/**
 * Clamp number between min and max
 * clamp(5, 0, 10) => 5
 * clamp(-5, 0, 10) => 0
 * clamp(15, 0, 10) => 10
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format currency for display with optional decimals
 * fmtCurr(1234567.89) => "$1,234,567.89"
 * fmtCurr(1234567.89, 0) => "$1,234,568"
 */
function fmtCurr(num, decimals = 2) {
  if (isNaN(num)) return '$0' + (decimals > 0 ? '.00' : '');
  const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return '$' + rounded.toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Validate input is a positive number
 * returns true if valid, false otherwise
 */
function isValidNum(val) {
  const num = parseNum(val);
  return !isNaN(num) && num >= 0;
}

/**
 * Validate percentage input (0-100)
 * returns true if valid, false otherwise
 */
function isValidPercent(val) {
  const num = parseNum(val);
  return !isNaN(num) && num >= 0 && num <= 100;
}

/**
 * Add commas to number without currency
 * addCommas(1234567) => "1,234,567"
 */
function addCommas(n) {
  if (isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-AU');
}

/**
 * Get current year
 */
function currentYear() {
  return new Date().getFullYear();
}

/**
 * Debounce function for input handlers
 * Prevents recalc on every keystroke
 */
function debounce(func, delay = 180) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Export for use in calculators (optional in browser context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtNum, fmt, fmtInt, parseNum, fmtPercent,
    calcLVR, monthlyRepayment, totalInterest,
    grossYield, netYield, compoundGrowth, equityFromRepayment,
    clamp, fmtCurr, isValidNum, isValidPercent,
    addCommas, currentYear, debounce
  };
}
