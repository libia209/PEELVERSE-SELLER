(() => {
  'use strict';

  const PEELVERSE_HOME_URL = 'https://libia209.github.io/PEELVERSE-/';
  const PEELVERSE_CREATOR_URL = 'https://libia209.github.io/PEELVERSE-/index.html#creator';
  const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const config = window.PEELVERSE_AUTH_CONFIG;
  if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    console.error('Missing PEELVERSE_AUTH_CONFIG in auth-config.js');
    return;
  }

  const supabaseClient = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
  );

  // DOM References
  const accountStatusEl = document.getElementById('accountStatus');
  const loadingSection = document.getElementById('loadingSection');
  const authSection = document.getElementById('authSection');
  const statusResultSection = document.getElementById('statusResultSection');
  const submittingSection = document.getElementById('submittingSection');
  const kycFormSection = document.getElementById('kycFormSection');

  // Auth DOM
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const otpRequestForm = document.getElementById('otpRequestForm');
  const authEmailInput = document.getElementById('authEmail');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpVerifyForm = document.getElementById('otpVerifyForm');
  const otpTargetEmail = document.getElementById('otpTargetEmail');
  const otpCodeInput = document.getElementById('otpCodeInput');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const changeEmailBtn = document.getElementById('changeEmailBtn');
  const authFeedback = document.getElementById('authFeedback');

  // KYC Form DOM
  const sellerKycForm = document.getElementById('sellerKycForm');
  const fullNameInput = document.getElementById('fullName');
  const dateOfBirthInput = document.getElementById('dateOfBirth');
  const cccdNumberInput = document.getElementById('cccdNumber');
  const shopNameInput = document.getElementById('shopName');
  const phoneInput = document.getElementById('phone');
  const businessAddressInput = document.getElementById('businessAddress');
  const commitmentCheck = document.getElementById('commitmentCheck');
  const submitKycBtn = document.getElementById('submitKycBtn');
  const formGlobalError = document.getElementById('formGlobalError');

  // Upload DOM
  const frontInput = document.getElementById('cccdFrontInput');
  const frontDropzone = document.getElementById('frontDropzone');
  const frontPlaceholder = document.getElementById('frontPlaceholder');
  const frontPreviewImg = document.getElementById('frontPreviewImg');
  const frontMeta = document.getElementById('frontMeta');
  const frontFileName = document.getElementById('frontFileName');
  const frontClearBtn = document.getElementById('frontClearBtn');

  const backInput = document.getElementById('cccdBackInput');
  const backDropzone = document.getElementById('backDropzone');
  const backPlaceholder = document.getElementById('backPlaceholder');
  const backPreviewImg = document.getElementById('backPreviewImg');
  const backMeta = document.getElementById('backMeta');
  const backFileName = document.getElementById('backFileName');
  const backClearBtn = document.getElementById('backClearBtn');

  // Runtime state (strictly in-memory; never persisted to localStorage)
  let currentUser = null;
  let pendingOtpEmail = '';
  let frontFile = null;
  let frontObjectUrl = null;
  let backFile = null;
  let backObjectUrl = null;
  let isSubmitting = false;

  // =========================================================================
  // Helpers
  // =========================================================================

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function maskCccd(cccd) {
    const clean = String(cccd || '').trim();
    if (!clean) return '********';
    if (clean.length <= 4) return '*'.repeat(clean.length);
    return '*'.repeat(clean.length - 4) + clean.slice(-4);
  }

  function calculateAge(dobString) {
    if (!dobString) return -1;
    const parts = dobString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return -1;
    const [year, month, day] = parts;
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() + 1 - month;
    if (m < 0 || (m === 0 && today.getDate() < day)) {
      age -= 1;
    }
    return age;
  }

  function getFileExtension(file) {
    const mimeMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };
    if (mimeMap[file.type]) return mimeMap[file.type];
    const parts = (file.name || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function setSectionsVisibility({ loading = false, auth = false, result = false, submitting = false, form = false }) {
    loadingSection.hidden = !loading;
    authSection.hidden = !auth;
    statusResultSection.hidden = !result;
    submittingSection.hidden = !submitting;
    kycFormSection.hidden = !form;
  }

  function showAuthFeedback(message, type = 'error') {
    authFeedback.textContent = message;
    authFeedback.className = `feedback-banner feedback-banner--${type}`;
    authFeedback.hidden = false;
  }

  function hideAuthFeedback() {
    authFeedback.hidden = true;
    authFeedback.textContent = '';
  }

  function setFieldError(errorId, inputEl, message) {
    const errEl = document.getElementById(errorId);
    if (errEl) errEl.textContent = message || '';
    if (inputEl) {
      inputEl.classList.toggle('is-invalid', Boolean(message));
    }
  }

  function clearAllFieldErrors() {
    setFieldError('err-fullName', fullNameInput, '');
    setFieldError('err-dateOfBirth', dateOfBirthInput, '');
    setFieldError('err-cccdNumber', cccdNumberInput, '');
    setFieldError('err-cccdFront', frontDropzone, '');
    setFieldError('err-cccdBack', backDropzone, '');
    setFieldError('err-shopName', shopNameInput, '');
    setFieldError('err-phone', phoneInput, '');
    setFieldError('err-businessAddress', businessAddressInput, '');
    setFieldError('err-commitment', null, '');
    formGlobalError.hidden = true;
    formGlobalError.textContent = '';
  }

  // =========================================================================
  // Header Account Status
  // =========================================================================

  function renderHeaderAccount(user) {
    if (!user) {
      accountStatusEl.innerHTML = `
        <span class="status-pill status-pill--muted">Chưa đăng nhập</span>
      `;
      return;
    }

    const label = escapeHtml(user.email || 'Tài khoản PEELVERSE');
    accountStatusEl.innerHTML = `
      <span class="status-pill status-pill--active" title="${label}">
        <span class="status-dot" aria-hidden="true"></span>
        <span>${label}</span>
      </span>
      <button type="button" id="logoutBtn" class="logout-btn">Đăng xuất</button>
    `;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }
  }

  async function handleLogout() {
    await supabaseClient.auth.signOut();
    clearImageSelection('front');
    clearImageSelection('back');
    sellerKycForm.reset();
    clearAllFieldErrors();
  }

  // =========================================================================
  // Auth Flow (Google OAuth & Email OTP)
  // =========================================================================

  function getRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  googleLoginBtn.addEventListener('click', async () => {
    hideAuthFeedback();
    googleLoginBtn.disabled = true;
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl()
        }
      });
      if (error) throw error;
    } catch (err) {
      showAuthFeedback(err.message || 'Không thể kết nối Google OAuth. Vui lòng thử lại.');
      googleLoginBtn.disabled = false;
    }
  });

  otpRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthFeedback();

    const email = authEmailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAuthFeedback('Vui lòng nhập địa chỉ email hợp lệ.');
      authEmailInput.focus();
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Đang gửi mã...';

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getRedirectUrl()
        }
      });
      if (error) throw error;

      pendingOtpEmail = email;
      otpTargetEmail.textContent = email;
      otpRequestForm.hidden = true;
      otpVerifyForm.hidden = false;
      otpCodeInput.value = '';
      otpCodeInput.focus();
    } catch (err) {
      showAuthFeedback(err.message || 'Không thể gửi mã OTP. Vui lòng thử lại.');
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Gửi mã xác thực OTP';
    }
  });

  otpVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthFeedback();

    const token = otpCodeInput.value.trim();
    if (!/^\d{6}$/.test(token)) {
      showAuthFeedback('Vui lòng nhập đúng mã OTP gồm 6 chữ số.');
      otpCodeInput.focus();
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = 'Đang xác nhận...';

    try {
      const { error } = await supabaseClient.auth.verifyOtp({
        email: pendingOtpEmail,
        token,
        type: 'email'
      });
      if (error) throw error;
      // onAuthStateChange will load verification state automatically
    } catch (err) {
      showAuthFeedback(err.message || 'Mã OTP không chính xác hoặc đã hết hạn.');
    } finally {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = 'Xác nhận & Đăng nhập';
    }
  });

  changeEmailBtn.addEventListener('click', () => {
    hideAuthFeedback();
    otpVerifyForm.hidden = true;
    otpRequestForm.hidden = false;
    authEmailInput.focus();
  });

  // =========================================================================
  // Image Upload & Preview (No localStorage)
  // =========================================================================

  function handleImageSelect(side, file) {
    const isFront = side === 'front';
    const errId = isFront ? 'err-cccdFront' : 'err-cccdBack';
    const dropzone = isFront ? frontDropzone : backDropzone;

    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFieldError(errId, dropzone, 'Chỉ chấp nhận ảnh định dạng JPG, PNG hoặc WebP.');
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setFieldError(errId, dropzone, 'Dung lượng ảnh vượt quá 3MB. Vui lòng chọn ảnh nhẹ hơn.');
      return;
    }

    setFieldError(errId, dropzone, '');

    if (isFront) {
      if (frontObjectUrl) URL.revokeObjectURL(frontObjectUrl);
      frontFile = file;
      frontObjectUrl = URL.createObjectURL(file);
      frontPreviewImg.src = frontObjectUrl;
      frontPreviewImg.hidden = false;
      frontPlaceholder.hidden = true;
      frontDropzone.classList.add('has-image');
      frontFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
      frontMeta.hidden = false;
    } else {
      if (backObjectUrl) URL.revokeObjectURL(backObjectUrl);
      backFile = file;
      backObjectUrl = URL.createObjectURL(file);
      backPreviewImg.src = backObjectUrl;
      backPreviewImg.hidden = false;
      backPlaceholder.hidden = true;
      backDropzone.classList.add('has-image');
      backFileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
      backMeta.hidden = false;
    }
  }

  function clearImageSelection(side) {
    const isFront = side === 'front';
    if (isFront) {
      if (frontObjectUrl) {
        URL.revokeObjectURL(frontObjectUrl);
        frontObjectUrl = null;
      }
      frontFile = null;
      frontInput.value = '';
      frontPreviewImg.removeAttribute('src');
      frontPreviewImg.hidden = true;
      frontPlaceholder.hidden = false;
      frontDropzone.classList.remove('has-image');
      frontFileName.textContent = '';
      frontMeta.hidden = true;
    } else {
      if (backObjectUrl) {
        URL.revokeObjectURL(backObjectUrl);
        backObjectUrl = null;
      }
      backFile = null;
      backInput.value = '';
      backPreviewImg.removeAttribute('src');
      backPreviewImg.hidden = true;
      backPlaceholder.hidden = false;
      backDropzone.classList.remove('has-image');
      backFileName.textContent = '';
      backMeta.hidden = true;
    }
  }

  frontInput.addEventListener('change', (e) => handleImageSelect('front', e.target.files?.[0]));
  backInput.addEventListener('change', (e) => handleImageSelect('back', e.target.files?.[0]));
  frontClearBtn.addEventListener('click', () => clearImageSelection('front'));
  backClearBtn.addEventListener('click', () => clearImageSelection('back'));

  // Numeric sanitizers for CCCD & Phone
  cccdNumberInput.addEventListener('input', () => {
    cccdNumberInput.value = cccdNumberInput.value.replace(/\D/g, '').slice(0, 12);
  });

  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  });

  // =========================================================================
  // Verification State Rendering
  // =========================================================================

  function renderSuggestionsHtml(suggestions) {
    if (!suggestions) return '';
    let items = [];
    if (Array.isArray(suggestions)) {
      items = suggestions.filter(Boolean);
    } else if (typeof suggestions === 'string') {
      try {
        const parsed = JSON.parse(suggestions);
        if (Array.isArray(parsed)) items = parsed.filter(Boolean);
        else items = [suggestions];
      } catch {
        items = suggestions.split('\n').map((s) => s.trim()).filter(Boolean);
      }
    }
    if (!items.length) return '';

    return `
      <div class="detail-item detail-item--full">
        <span class="detail-label">Gợi ý chỉnh sửa</span>
        <ul class="suggestion-list">
          ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  function renderVerificationResult(record) {
    const status = (record?.status || '').toLowerCase();

    if (status === 'verified') {
      statusResultSection.className = 'card status-result-card status-result-card--verified';
      statusResultSection.innerHTML = `
        <div class="result-header">
          <div class="result-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div>
            <span class="result-badge">Đã xác minh</span>
            <h2 class="result-title">Tài khoản bán hàng đã được xác minh &amp; đồng bộ</h2>
            <p class="result-desc">
              Hồ sơ định danh và gian hàng của bạn đã được phê duyệt. Bạn có thể đăng sản phẩm và quản lý đơn hàng ngay trên PEELVERSE.
            </p>
          </div>
        </div>

        <div class="result-details">
          <div class="detail-item">
            <span class="detail-label">Gian hàng / Thương hiệu</span>
            <span class="detail-value">${escapeHtml(record.shop_name || '—')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Số CCCD</span>
            <span class="detail-value input-mono">${escapeHtml(maskCccd(record.cccd_number))}</span>
          </div>
        </div>

        <div class="result-actions">
          <a href="${PEELVERSE_CREATOR_URL}" class="btn btn-primary">
            Mở Kênh Nhà sáng tạo trên PEELVERSE →
          </a>
        </div>
      `;
      setSectionsVisibility({ result: true });
      return;
    }

    if (status === 'needs_review' || status === 'pending') {
      statusResultSection.className = 'card status-result-card status-result-card--review';
      statusResultSection.innerHTML = `
        <div class="result-header">
          <div class="result-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <span class="result-badge">Chờ kiểm duyệt</span>
            <h2 class="result-title">Hồ sơ đang chờ kiểm duyệt bổ sung (1–2 ngày)</h2>
            <p class="result-desc">
              Hồ sơ của bạn đã được tiếp nhận và chuyển tới bộ phận kiểm duyệt để đối chiếu bổ sung. Trạng thái sẽ tự động cập nhật sau khi hoàn tất.
            </p>
          </div>
        </div>

        <div class="result-details">
          <div class="detail-item">
            <span class="detail-label">Gian hàng / Thương hiệu</span>
            <span class="detail-value">${escapeHtml(record.shop_name || '—')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Số CCCD đã che</span>
            <span class="detail-value input-mono">${escapeHtml(maskCccd(record.cccd_number))}</span>
          </div>
          ${record.ai_review_note ? `
            <div class="detail-item detail-item--full">
              <span class="detail-label">Nhận xét từ hệ thống</span>
              <span class="detail-value">${escapeHtml(record.ai_review_note)}</span>
            </div>
          ` : ''}
        </div>

        <div class="result-actions">
          <a href="${PEELVERSE_HOME_URL}" class="btn btn-outline">
            ← Quay lại trang chủ PEELVERSE
          </a>
        </div>
      `;
      setSectionsVisibility({ result: true });
      return;
    }

    if (status === 'rejected') {
      statusResultSection.className = 'card status-result-card status-result-card--rejected';
      statusResultSection.innerHTML = `
        <div class="result-header">
          <div class="result-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <span class="result-badge">Cần chỉnh sửa &amp; gửi lại</span>
            <h2 class="result-title">Hồ sơ chưa đạt yêu cầu xác minh</h2>
            <p class="result-desc">
              Vui lòng kiểm tra lý do bên dưới, cập nhật thông tin hoặc tải lại ảnh CCCD rõ nét hơn để gửi kiểm duyệt lại ngay.
            </p>
          </div>
        </div>

        <div class="result-details">
          <div class="detail-item detail-item--full">
            <span class="detail-label">Lý do từ chối</span>
            <span class="detail-value">${escapeHtml(record.ai_review_note || 'Thông tin hoặc hình ảnh giấy tờ chưa khớp / chưa đủ rõ nét.')}</span>
          </div>
          ${renderSuggestionsHtml(record.ai_suggestions)}
        </div>
      `;

      // Prefill non-sensitive or existing fields so user can quickly fix & resubmit
      if (record.full_name && !fullNameInput.value) fullNameInput.value = record.full_name;
      if (record.date_of_birth && !dateOfBirthInput.value) dateOfBirthInput.value = record.date_of_birth;
      if (record.cccd_number && !cccdNumberInput.value) cccdNumberInput.value = record.cccd_number;
      if (record.shop_name && !shopNameInput.value) shopNameInput.value = record.shop_name;
      if (record.phone && !phoneInput.value) phoneInput.value = record.phone;
      if (record.business_address && !businessAddressInput.value) businessAddressInput.value = record.business_address;

      setSectionsVisibility({ result: true, form: true });
      return;
    }

    // Fallback: show form
    setSectionsVisibility({ form: true });
  }

  async function loadSellerVerification(user) {
    setSectionsVisibility({ loading: true });

    try {
      const { data, error } = await supabaseClient
        .from('seller_verifications')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setSectionsVisibility({ form: true });
        return;
      }

      renderVerificationResult(data);
    } catch (err) {
      console.error('Error loading seller_verifications:', err);
      setSectionsVisibility({ form: true });
      formGlobalError.textContent = 'Không thể tải trạng thái hồ sơ hiện tại. Bạn vẫn có thể điền thông tin để gửi mới.';
      formGlobalError.hidden = false;
    }
  }

  // =========================================================================
  // Form Validation & Submission
  // =========================================================================

  function validateKycForm() {
    clearAllFieldErrors();
    let isValid = true;
    let firstInvalidEl = null;

    const markInvalid = (errId, inputEl, msg) => {
      setFieldError(errId, inputEl, msg);
      isValid = false;
      if (!firstInvalidEl && inputEl) firstInvalidEl = inputEl;
    };

    const fullName = fullNameInput.value.trim();
    if (fullName.length < 2) {
      markInvalid('err-fullName', fullNameInput, 'Vui lòng nhập đầy đủ họ và tên theo CCCD.');
    }

    const dob = dateOfBirthInput.value;
    const age = calculateAge(dob);
    if (!dob || age < 0) {
      markInvalid('err-dateOfBirth', dateOfBirthInput, 'Vui lòng chọn ngày sinh hợp lệ.');
    } else if (age < 18) {
      markInvalid('err-dateOfBirth', dateOfBirthInput, 'Người bán bắt buộc phải đủ 18 tuổi trở lên.');
    }

    const cccd = cccdNumberInput.value.trim();
    if (!/^\d{12}$/.test(cccd)) {
      markInvalid('err-cccdNumber', cccdNumberInput, 'Số CCCD phải gồm đúng 12 chữ số.');
    }

    if (!frontFile) {
      markInvalid('err-cccdFront', frontDropzone, 'Vui lòng tải lên ảnh CCCD mặt trước.');
    }

    if (!backFile) {
      markInvalid('err-cccdBack', backDropzone, 'Vui lòng tải lên ảnh CCCD mặt sau.');
    }

    const shopName = shopNameInput.value.trim();
    if (shopName.length < 2) {
      markInvalid('err-shopName', shopNameInput, 'Vui lòng nhập tên gian hàng hoặc thương hiệu.');
    }

    const phone = phoneInput.value.trim();
    if (!/^\d{10}$/.test(phone)) {
      markInvalid('err-phone', phoneInput, 'Số điện thoại liên hệ phải gồm đúng 10 chữ số.');
    }

    const address = businessAddressInput.value.trim();
    if (address.length < 6) {
      markInvalid('err-businessAddress', businessAddressInput, 'Vui lòng nhập địa chỉ kinh doanh đầy đủ.');
    }

    if (!commitmentCheck.checked) {
      markInvalid('err-commitment', commitmentCheck, 'Bạn cần xác nhận cam kết thông tin chính chủ trước khi gửi.');
    }

    if (firstInvalidEl && typeof firstInvalidEl.focus === 'function') {
      firstInvalidEl.focus();
    }

    return isValid;
  }

  async function uploadKycImage(userId, side, file) {
    const ext = getFileExtension(file);
    const path = `${userId}/cccd-${side}-${Date.now()}.${ext}`;

    const { error } = await supabaseClient.storage
      .from('kyc-documents')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;
    return path;
  }

  sellerKycForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting || !currentUser) return;

    if (!validateKycForm()) return;

    isSubmitting = true;
    submitKycBtn.disabled = true;
    setSectionsVisibility({ submitting: true });

    try {
      // 1. Upload both CCCD images to private bucket 'kyc-documents'
      const [frontPath, backPath] = await Promise.all([
        uploadKycImage(currentUser.id, 'front', frontFile),
        uploadKycImage(currentUser.id, 'back', backFile)
      ]);

      // 2. Upsert record into seller_verifications
      const payload = {
        user_id: currentUser.id,
        full_name: fullNameInput.value.trim(),
        date_of_birth: dateOfBirthInput.value,
        cccd_number: cccdNumberInput.value.trim(),
        cccd_front_path: frontPath,
        cccd_back_path: backPath,
        shop_name: shopNameInput.value.trim(),
        phone: phoneInput.value.trim(),
        business_address: businessAddressInput.value.trim(),
        commitment_accepted: true,
        status: 'pending',
        updated_at: new Date().toISOString()
      };

      const { error: upsertError } = await supabaseClient
        .from('seller_verifications')
        .upsert(payload, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;

      // 3. Invoke Edge Function 'verify-seller'
      const { data: fnData, error: fnError } = await supabaseClient.functions.invoke('verify-seller', {
        body: { user_id: currentUser.id }
      });

      if (fnError) throw fnError;

      // Clear local file references from memory after successful submission
      clearImageSelection('front');
      clearImageSelection('back');

      // 4. Fetch latest verification record (or merge function response)
      const { data: latestRecord, error: fetchError } = await supabaseClient
        .from('seller_verifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const resultRecord = latestRecord || {
        ...payload,
        ...(fnData && typeof fnData === 'object' ? fnData : {})
      };

      renderVerificationResult(resultRecord);
    } catch (err) {
      console.error('KYC submission failed:', err);
      setSectionsVisibility({ form: true });
      formGlobalError.textContent = err.message || 'Có lỗi xảy ra khi gửi hồ sơ xác minh. Vui lòng thử lại.';
      formGlobalError.hidden = false;
      formGlobalError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      isSubmitting = false;
      submitKycBtn.disabled = false;
    }
  });

  // =========================================================================
  // Auth State Initialization
  // =========================================================================

  async function handleSession(session) {
    const user = session?.user || null;
    currentUser = user;
    renderHeaderAccount(user);

    if (!user) {
      setSectionsVisibility({ auth: true });
      return;
    }

    await loadSellerVerification(user);
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });

  (async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.error('getSession error:', error);
      handleSession(null);
      return;
    }
    handleSession(data?.session || null);
  })();
})();
