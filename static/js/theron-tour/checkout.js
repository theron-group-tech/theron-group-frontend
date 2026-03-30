(function () {
    function pickFirst() {
        for (var i = 0; i < arguments.length; i += 1) {
            var value = arguments[i];
            if (value !== null && value !== undefined && value !== '') {
                return value;
            }
        }
        return null;
    }

    function normalizeTrip(rawTrip) {
        var trip = rawTrip || {};
        var images = Array.isArray(trip.images) ? trip.images : [];
        var image = pickFirst(
            trip.coverImageUrl,
            trip.cover_image_url,
            images[0] && (typeof images[0] === 'string' ? images[0] : pickFirst(images[0].url, images[0].imageUrl))
        );
        return {
            id:          pickFirst(trip.id, trip.tripId),
            slug:        pickFirst(trip.slug, trip.code),
            title:       pickFirst(trip.title, trip.name, 'Viagem sem titulo'),
            destination: pickFirst(trip.destination, trip.city, 'Destino'),
            summary:     pickFirst(trip.shortDescription, trip.short_description, trip.summary, ''),
            price:       Number(pickFirst(trip.price, trip.basePrice, trip.base_price, 0) || 0),
            image:       image || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80'
        };
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
    }

    // Map backend coupon error messages to Portuguese
    var COUPON_MESSAGES = {
        'Coupon not found':                                           'Cupom nao encontrado.',
        'Coupon is inactive':                                         'Este cupom nao esta ativo.',
        'Coupon is outside validity period':                          'Este cupom esta fora do periodo de validade.',
        'Coupon usage limit reached':                                 'Limite de usos deste cupom foi atingido.',
        'Minimum purchase amount not reached for this coupon':        'Valor minimo de compra nao atingido para este cupom.',
        'You have already used this coupon the maximum number of times': 'Voce ja utilizou este cupom o maximo de vezes permitido.'
    };

    function translateCouponMessage(msg) {
        return COUPON_MESSAGES[msg] || (msg ? msg : 'Cupom invalido.');
    }

    var PAYMENT_STATUS_LABELS = {
        PENDING: 'Aguardando pagamento',
        CONFIRMED: 'Pagamento confirmado',
        RECEIVED: 'Pagamento recebido',
        OVERDUE: 'Pagamento vencido',
        REFUNDED: 'Pagamento estornado',
        CANCELLED: 'Pagamento cancelado'
    };

    function translatePaymentStatus(status) {
        return PAYMENT_STATUS_LABELS[status] || status || 'Desconhecido';
    }

    function bindCheckoutPage() {
        var page = document.querySelector('.tt-checkout-page');
        if (!page) { return; }

        // --- Auth check: redirect to login if not authenticated ---
        if (!window.AuthStorage || !window.AuthStorage.isAuthenticated()) {
            var currentUrl = window.location.pathname + window.location.search;
            var loginUrl = '/auth/login?return=' + encodeURIComponent(currentUrl);
            window.location.href = loginUrl;
            return;
        }

        var slug              = page.getAttribute('data-trip-slug');
        var form              = document.querySelector('#tt-checkout-form');
        var travelersInput    = document.querySelector('#tt-travelers');
        var cardFields        = document.querySelector('#tt-card-fields');
        var methodInputs      = document.querySelectorAll('input[name="paymentMethod"]');
        var submitButton      = document.querySelector('#tt-submit-checkout');
        var checkoutFeedback  = document.querySelector('#tt-checkout-feedback');
        var couponButton      = document.querySelector('#tt-apply-coupon');
        var removeCouponButton = document.querySelector('#tt-remove-coupon');
        var couponInput       = document.querySelector('#tt-coupon-code');
        var couponMessage     = document.querySelector('#tt-coupon-message');
        var paymentExtra      = document.querySelector('#tt-payment-extra');
        var passengersList    = document.querySelector('#tt-passengers-list');
        var pixBox            = document.querySelector('#tt-pix-box');
        var pixImage          = document.querySelector('#tt-pix-image');
        var pixPayload        = document.querySelector('#tt-pix-payload');
        var pixExpiration     = document.querySelector('#tt-pix-expiration');
        var pixStatus         = document.querySelector('#tt-pix-status');
        var copyPixButton     = document.querySelector('#tt-copy-pix');

        // Get authenticated user data
        var authUser = window.AuthStorage.getUser() || {};

        var state = {
            trip:        null,
            quantity:    1,
            couponCode:  '',
            couponData:  null,   // full payload from /api/coupons/validate when valid=true
            paymentMethod: 'PIX',
            authToken:   window.AuthStorage.getToken(),
            pixPollingTimer: null
        };

        // Pre-fill customer data from auth
        if (authUser.fullName) {
            document.querySelector('#tt-customer-name').value = authUser.fullName;
        }
        if (authUser.email) {
            document.querySelector('#tt-customer-email').value = authUser.email;
        }

        // --- Fetch helper with auth token ---
        function buildFetchHeaders() {
            var headers = { 'Content-Type': 'application/json' };
            if (state.authToken) {
                headers['Authorization'] = 'Bearer ' + state.authToken;
            }
            return headers;
        }

        // --- UI helpers ---
        function showMessage(node, text, isError) {
            node.textContent = text;
            node.classList.remove('hidden');
            node.style.color       = isError ? '#9f1239' : '#0f5132';
            node.style.borderColor = isError ? '#f5c2c7' : '#badbcc';
            node.style.background  = isError ? '#f8d7da' : '#d1e7dd';
        }

        function clearMessage(node) {
            node.textContent = '';
            node.classList.add('hidden');
            node.removeAttribute('style');
        }

        function currentMethod() {
            var checked = document.querySelector('input[name="paymentMethod"]:checked');
            return checked ? checked.value : 'PIX';
        }

        function shouldShowCardFields() {
            var method = currentMethod();
            return method === 'DEBIT_CARD' || method === 'CREDIT_CARD';
        }

        function updateCardFieldsVisibility() {
            if (shouldShowCardFields()) {
                cardFields.classList.remove('hidden');
                if (pixBox) { pixBox.classList.add('hidden'); }
            } else {
                cardFields.classList.add('hidden');
            }
        }

        // --- Totals — use API-computed values when coupon is active ---
        function calculateTotals() {
            var price = state.trip ? Number(state.trip.price || 0) : 0;
            var qty   = Math.max(Number(state.quantity || 1), 1);
            var subtotal, discount, total;

            if (state.couponData) {
                subtotal = Number(state.couponData.originalAmount || (price * qty));
                discount = Number(state.couponData.discountAmount || 0);
                total    = Number(state.couponData.finalAmount    || Math.max(subtotal - discount, 0));
            } else {
                subtotal = price * qty;
                discount = 0;
                total    = subtotal;
            }

            document.querySelector('#tt-subtotal').textContent = formatCurrency(subtotal);
            document.querySelector('#tt-discount').textContent = '- ' + formatCurrency(discount);
            document.querySelector('#tt-total').textContent    = formatCurrency(total);

            return { subtotal: subtotal, discount: discount, total: total };
        }

        function mountSummary(trip) {
            document.querySelector('#tt-summary-image').src            = trip.image;
            document.querySelector('#tt-summary-title').textContent    = trip.title;
            document.querySelector('#tt-summary-destination').textContent = trip.destination;
            document.querySelector('#tt-summary-description').textContent = trip.summary || 'Roteiro com curadoria premium Theron Tour.';
        }

        // --- Passengers ---
        function buildPassengerRow(index) {
            var div = document.createElement('div');
            div.className = 'tt-passenger-row';
            div.dataset.index = index;
            div.innerHTML = [
                '<p class="montserrat tt-passenger-label">Viajante ' + (index + 1) + '</p>',
                '<div class="tt-form-grid">',
                '  <label class="inter">Nome completo',
                '    <input type="text" data-passenger="fullName" placeholder="Nome completo">',
                '  </label>',
                '  <label class="inter">CPF',
                '    <input type="text" data-passenger="cpf" placeholder="000.000.000-00" maxlength="14">',
                '  </label>',
                '  <label class="inter">Data de nascimento',
                '    <input type="date" data-passenger="birthDate">',
                '  </label>',
                '</div>'
            ].join('');
            return div;
        }

        function rebuildPassengers(qty) {
            if (!passengersList) { return; }
            while (passengersList.children.length > qty) {
                passengersList.removeChild(passengersList.lastChild);
            }
            while (passengersList.children.length < qty) {
                passengersList.appendChild(buildPassengerRow(passengersList.children.length));
            }
        }

        function collectPassengers() {
            if (!passengersList) { return []; }
            var rows = passengersList.querySelectorAll('.tt-passenger-row');
            var passengers = [];
            rows.forEach(function (row) {
                passengers.push({
                    fullName:  (row.querySelector('[data-passenger="fullName"]').value || '').trim(),
                    cpf:       (row.querySelector('[data-passenger="cpf"]').value || '').trim(),
                    birthDate: (row.querySelector('[data-passenger="birthDate"]').value || '') || null
                });
            });
            return passengers;
        }

        // --- Coupon state ---
        function updateCouponAppliedState() {
            couponInput.disabled = true;
            couponButton.classList.add('hidden');
            if (removeCouponButton) { removeCouponButton.classList.remove('hidden'); }
        }

        function updateCouponRemovedState() {
            couponInput.disabled = false;
            couponButton.classList.remove('hidden');
            if (removeCouponButton) { removeCouponButton.classList.add('hidden'); }
        }

        function removeCoupon() {
            state.couponCode = '';
            state.couponData = null;
            couponInput.value = '';
            clearMessage(couponMessage);
            calculateTotals();
            updateCouponRemovedState();
        }

        function applyCoupon() {
            clearMessage(couponMessage);
            var code = (couponInput.value || '').trim().toUpperCase();

            if (!code) {
                showMessage(couponMessage, 'Digite um codigo de cupom para aplicar.', true);
                return;
            }
            if (!state.trip) {
                showMessage(couponMessage, 'Viagem ainda nao carregada. Tente novamente.', true);
                return;
            }

            var email         = (document.querySelector('#tt-customer-email').value || '').trim();
            var departureDate = (document.querySelector('#tt-departure-date').value || '').trim();
            var returnDate    = (document.querySelector('#tt-return-date').value || '').trim();
            var qty           = Math.max(Number(state.quantity || 1), 1);

            couponButton.disabled    = true;
            couponButton.textContent = 'Aplicando...';

            var body = { code: code, tripId: state.trip.id, quantity: qty };
            if (email)         { body.customerEmail  = email; }
            if (departureDate) { body.departureDate  = departureDate; }
            if (returnDate)    { body.returnDate     = returnDate; }

            fetch('/api/coupons/validate', {
                method:  'POST',
                headers: buildFetchHeaders(),
                body:    JSON.stringify(body)
            })
                .then(function (r) { return r.json(); })
                .then(function (json) {
                    var payload = json && json.data !== undefined ? json.data : json;

                    // valid=false or HTTP error body
                    if (!payload || payload.valid === false) {
                        state.couponCode = '';
                        state.couponData = null;
                        calculateTotals();
                        updateCouponRemovedState();
                        showMessage(couponMessage, translateCouponMessage(payload && payload.message), true);
                        return;
                    }

                    state.couponCode = code;
                    state.couponData = payload;
                    calculateTotals();
                    updateCouponAppliedState();

                    var discountLabel = formatCurrency(payload.discountAmount) +
                        (payload.discountType === 'PERCENTAGE' ? ' de desconto aplicado.' : ' de desconto fixo aplicado.');
                    showMessage(couponMessage, 'Cupom aplicado com sucesso! ' + discountLabel, false);
                })
                .catch(function () {
                    state.couponCode = '';
                    state.couponData = null;
                    calculateTotals();
                    updateCouponRemovedState();
                    showMessage(couponMessage, 'Nao foi possivel validar o cupom. Verifique sua conexao.', true);
                })
                .finally(function () {
                    couponButton.disabled    = false;
                    couponButton.textContent = 'Aplicar';
                });
        }

        // --- Card ---
        function collectCardData() {
            var month = (document.querySelector('#tt-card-expiry-month') && document.querySelector('#tt-card-expiry-month').value || '').trim();
            var year = (document.querySelector('#tt-card-expiry-year') && document.querySelector('#tt-card-expiry-year').value || '').trim();
            var fallbackExpiry = (document.querySelector('#tt-card-expiry') && document.querySelector('#tt-card-expiry').value || '').trim();
            return {
                holderName: (document.querySelector('#tt-card-holder').value || '').trim(),
                number:     (document.querySelector('#tt-card-number').value || '').trim(),
                expiry:     (month && year) ? (month + '/' + year) : fallbackExpiry,
                cvv:        (document.querySelector('#tt-card-cvv').value || '').trim()
            };
        }

        function validateCardFields() {
            if (!shouldShowCardFields()) { return true; }
            var card = collectCardData();
            if (!card.holderName || !card.number || !card.expiry || !card.cvv) {
                showMessage(checkoutFeedback, 'Preencha todos os dados do cartao para continuar.', true);
                return false;
            }
            return true;
        }

        // --- Payment ---
        function finalizePayment(bookingId, totals) {
            var payload = {
                method:     state.paymentMethod,
                amount:     totals.total,
                couponCode: state.couponCode || null
            };
            if (shouldShowCardFields()) { payload.card = collectCardData(); }

            return fetch('/api/payments/booking/' + encodeURIComponent(String(bookingId)), {
                method:  'POST',
                headers: buildFetchHeaders(),
                body:    JSON.stringify(payload)
            }).then(function (r) { return r.json().catch(function () { return {}; }); });
        }

        function payWithPix(bookingId) {
            var cpfCnpj = (document.querySelector('#tt-cpf-cnpj') && document.querySelector('#tt-cpf-cnpj').value || '').replace(/\D/g, '');
            if (!cpfCnpj) {
                return Promise.reject(new Error('CPF/CNPJ do pagador e obrigatorio para PIX.'));
            }

            return fetch('/api/payments/booking/' + encodeURIComponent(String(bookingId)) + '/pix', {
                method: 'POST',
                headers: buildFetchHeaders(),
                body: JSON.stringify({ cpfCnpj: cpfCnpj })
            }).then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (json) {
                    return {
                        ok: r.ok,
                        status: r.status,
                        message: json.message || '',
                        payload: json && json.data !== undefined ? json.data : json
                    };
                });
            });
        }

        function renderPix(payload) {
            if (!pixBox) { return; }
            pixBox.classList.remove('hidden');

            var encoded = payload.pixEncodedImage || payload.encodedImage || '';
            if (encoded && pixImage) {
                pixImage.src = encoded.indexOf('data:image') === 0 ? encoded : 'data:image/png;base64,' + encoded;
                pixImage.classList.remove('hidden');
            }

            if (pixPayload) {
                pixPayload.value = payload.pixPayload || payload.payload || '';
            }
            if (pixExpiration) {
                pixExpiration.textContent = payload.pixExpirationDate || payload.expirationDate || '-';
            }
            if (pixStatus) {
                pixStatus.textContent = translatePaymentStatus(payload.status || 'PENDING');
            }
        }

        function stopPixPolling() {
            if (state.pixPollingTimer) {
                clearInterval(state.pixPollingTimer);
                state.pixPollingTimer = null;
            }
        }

        function startPixPolling(bookingId) {
            stopPixPolling();
            state.pixPollingTimer = setInterval(function () {
                fetch('/api/payments/booking/' + encodeURIComponent(String(bookingId)), {
                    method: 'GET',
                    headers: buildFetchHeaders()
                })
                    .then(function (r) { return r.json().catch(function () { return {}; }); })
                    .then(function (json) {
                        var payload = json && json.data !== undefined ? json.data : json;
                        var status = payload && payload.status ? payload.status : 'PENDING';

                        if (pixStatus) {
                            pixStatus.textContent = translatePaymentStatus(status);
                        }

                        if (status === 'CONFIRMED' || status === 'RECEIVED') {
                            stopPixPolling();
                            showMessage(checkoutFeedback, 'Pagamento PIX confirmado com sucesso!', false);
                        }
                    })
                    .catch(function () {
                        // Keep polling despite transient errors.
                    });
            }, 5000);
        }

        // --- Submit ---
        function submitCheckout(event) {
            event.preventDefault();
            clearMessage(checkoutFeedback);
            paymentExtra.textContent = '';

            if (!state.trip) {
                showMessage(checkoutFeedback, 'Viagem ainda nao carregada. Aguarde e tente novamente.', true);
                return;
            }

            state.paymentMethod = currentMethod();
            state.quantity = Math.max(Number(travelersInput.value || 1), 1);
            var totals = calculateTotals();

            if (!validateCardFields()) { return; }

            submitButton.disabled    = true;
            submitButton.textContent = 'Processando...';

            var name          = (document.querySelector('#tt-customer-name').value || '').trim();
            var email         = (document.querySelector('#tt-customer-email').value || '').trim();
            var phone         = (document.querySelector('#tt-customer-phone').value || '').trim();
            var departureDate = (document.querySelector('#tt-departure-date').value || '') || null;
            var returnDate    = (document.querySelector('#tt-return-date').value || '') || null;

            var bookingPayload = {
                tripId:        state.trip.id,
                customerName:  name,
                customerEmail: email,
                customerPhone: phone,
                departureDate: departureDate,
                returnDate:    returnDate,
                quantity:      state.quantity,
                couponCode:    state.couponCode || null,
                passengers:    collectPassengers()
            };

            fetch('/api/bookings', {
                method:  'POST',
                headers: buildFetchHeaders(),
                body:    JSON.stringify(bookingPayload)
            })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(function (json) {
                    // Backend rejected with coupon error
                    if (json && json.success === false) {
                        var msg = json.message || '';
                        var lower = msg.toLowerCase();
                        if (lower.indexOf('coupon') !== -1 || lower.indexOf('cupom') !== -1) {
                            showMessage(couponMessage, translateCouponMessage(msg), true);
                            removeCoupon();
                        }
                        throw new Error(translateCouponMessage(msg) || 'Erro ao criar reserva.');
                    }

                    var payload   = json && json.data !== undefined ? json.data : json;
                    var bookingId = pickFirst(payload.id, payload.bookingId);
                    if (!bookingId) { throw new Error('Reserva criada sem ID. Contate o suporte.'); }

                    if (state.paymentMethod === 'PIX') {
                        return payWithPix(bookingId).then(function (paymentResult) {
                            return { bookingId: bookingId, paymentResult: paymentResult, isPix: true };
                        });
                    }

                    return finalizePayment(bookingId, totals).then(function (paymentResult) {
                        return { bookingId: bookingId, paymentResult: paymentResult, isPix: false };
                    });
                })
                .then(function (result) {
                    var paymentPayload = result.paymentResult && result.paymentResult.payload !== undefined
                        ? result.paymentResult.payload
                        : (result.paymentResult && result.paymentResult.data !== undefined
                            ? result.paymentResult.data
                            : result.paymentResult);

                    if (result.isPix) {
                        if (!result.paymentResult.ok) {
                            throw new Error(result.paymentResult.message || 'Falha ao gerar PIX para a reserva.');
                        }

                        renderPix(paymentPayload || {});
                        startPixPolling(result.bookingId);
                        showMessage(checkoutFeedback, 'QR Code PIX gerado com sucesso! Reserva #' + result.bookingId + '.', false);
                        return;
                    }

                    showMessage(checkoutFeedback, 'Compra realizada com sucesso! Reserva #' + result.bookingId + '.', false);
                    form.reset();
                    rebuildPassengers(1);
                    removeCoupon();
                })
                .catch(function (err) {
                    var msg = (err && err.message) ? err.message : 'Nao foi possivel finalizar a compra. Tente novamente.';
                    showMessage(checkoutFeedback, msg, true);
                })
                .finally(function () {
                    submitButton.disabled    = false;
                    submitButton.textContent = 'Comprar agora';
                });
        }

        // --- Event listeners ---
        travelersInput.addEventListener('input', function () {
            state.quantity = Math.max(Number(travelersInput.value || 1), 1);
            rebuildPassengers(state.quantity);
            // coupon amounts depend on quantity — force re-validation
            if (state.couponData) {
                removeCoupon();
                showMessage(couponMessage, 'Quantidade alterada. Reaplicar o cupom.', true);
            } else {
                calculateTotals();
            }
        });

        methodInputs.forEach(function (input) {
            input.addEventListener('change', function () {
                state.paymentMethod = currentMethod();
                updateCardFieldsVisibility();
            });
        });

        couponButton.addEventListener('click', applyCoupon);
        if (removeCouponButton) { removeCouponButton.addEventListener('click', removeCoupon); }
        if (copyPixButton) {
            copyPixButton.addEventListener('click', function () {
                if (!pixPayload || !pixPayload.value) {
                    return;
                }
                navigator.clipboard.writeText(pixPayload.value)
                    .then(function () {
                        showMessage(checkoutFeedback, 'Codigo PIX copiado com sucesso.', false);
                    })
                    .catch(function () {
                        showMessage(checkoutFeedback, 'Nao foi possivel copiar automaticamente.', true);
                    });
            });
        }
        form.addEventListener('submit', submitCheckout);

        updateCardFieldsVisibility();
        updateCouponRemovedState();
        rebuildPassengers(1);

        // Load trip data
        fetch('/api/public/trips/' + encodeURIComponent(slug), {
            headers: buildFetchHeaders()
        })
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var payload = json && json.data !== undefined ? json.data : json;
                state.trip = normalizeTrip(payload || {});
                mountSummary(state.trip);
                calculateTotals();
            })
            .catch(function () {
                showMessage(checkoutFeedback, 'Nao foi possivel carregar os dados da viagem.', true);
                submitButton.disabled = true;
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindCheckoutPage);
    } else {
        bindCheckoutPage();
    }
})();
