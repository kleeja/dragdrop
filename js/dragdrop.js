/*
 * DragDrop style: drop files on the zone of the index page, or click it to choose them.
 * The files of one drop are sent in one ajax request, as the file_N_ fields of the bootstrap upload form,
 * so the verification code and the flood check of the server are passed once for all of them.
 * Loaded after script.js of the bootstrap style, which gives update_kleeja_captcha() and the copy buttons
 * of the upload results.
 */
(function () {
    'use strict';

    var zone = document.getElementById('dropzone');

    if (!zone) {
        return;
    }

    var input = document.getElementById('dropzone-file');
    var messages = document.getElementById('upload-messages');
    var errors = document.getElementById('upload-errors');
    var idle = zone.querySelector('.drop-zone-idle');
    var busy = zone.querySelector('.drop-zone-progress');
    var progress = zone.querySelector('.progress');
    var bar = zone.querySelector('.progress-bar');
    var captcha = document.getElementById('kleeja_code_answer');
    var captchaImg = document.getElementById('kleeja_img_captcha');
    var lang = window.STYLE_LANG || {};
    var exts = window.UPLOAD_ALLOWED_EXTS;
    var sizes = window.UPLOAD_ALLOWED_SIZES || [];
    var maxFiles = window.UPLOAD_MAX_FILES || 1;
    var uploading = false;
    var dragDepth = 0;

    input.multiple = maxFiles > 1;

    // a string missing from the language pack is printed as {lang.KEY}
    function text(key, fallback) {
        var value = lang[key];

        return value && value.indexOf('{lang.') !== 0 ? value : fallback;
    }

    // fill %s like placeholders, split and join so a $ in a file name is kept as is
    function fill(message, values) {
        Object.keys(values).forEach(function (key) {
            message = message.split(key).join(values[key]);
        });

        return message;
    }

    // same checks as the server, so a wrong file is not uploaded for nothing
    function checkFile(file) {
        if (!Array.isArray(exts)) {
            return '';
        }

        var dot = file.name.lastIndexOf('.');

        if (dot === -1) {
            return fill(text('wrongName', 'File name "%s" is not allowed.'), { '%s': file.name });
        }

        var ext = file.name.substring(dot + 1).toLowerCase();
        var index = exts.indexOf(ext);

        if (index === -1) {
            return fill(text('forbidExt', 'Extension "%s" is not allowed.'), { '%s': ext });
        }

        if (file.size > sizes[index]) {
            return fill(text('sizeTooBig', 'File size of "%1$s" must be smaller than %2$s.'), {
                '%1$s': file.name,
                '%2$s': (sizes[index] / 1048576).toFixed(2) + ' MB',
            });
        }

        return '';
    }

    // errors found here are text, file names included, so they never become html
    function showErrors(list) {
        errors.textContent = '';

        list.forEach(function (message) {
            var line = document.createElement('div');

            line.textContent = message;
            errors.appendChild(line);
        });

        errors.classList.toggle('d-none', list.length === 0);
    }

    // the messages of the server, html made by the uploader, in the markup of the messages in index_body.html
    function addMessages(list) {
        var first = null;

        list.forEach(function (item) {
            var box = document.createElement('div');
            var content = document.createElement('div');

            content.innerHTML = item.message_content;

            if (item.message_type === 'info') {
                box.className = 'card upload-result border-success-subtle shadow-sm mb-3';
                content.className = 'card-body p-4';
            } else {
                var icon = document.createElement('i');

                box.className = 'alert alert-danger d-flex align-items-start gap-2';
                box.setAttribute('role', 'alert');
                icon.className = 'fa-solid fa-circle-exclamation mt-1';
                box.appendChild(icon);
            }

            box.appendChild(content);
            messages.appendChild(box);
            first = first || box;
        });

        if (first && first.scrollIntoView) {
            first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    // the errors of the last drop go away with the next one, the upload results stay
    function clearOldErrors() {
        Array.prototype.slice.call(messages.querySelectorAll('.alert')).forEach(function (alert) {
            alert.parentNode.removeChild(alert);
        });

        showErrors([]);
    }

    function setProgress(percent) {
        var value = Math.round(percent);

        bar.style.width = value + '%';
        bar.textContent = value + '%';
        progress.setAttribute('aria-valuenow', value);
    }

    function setBusy(on) {
        uploading = on;
        zone.classList.toggle('is-uploading', on);
        zone.setAttribute('aria-disabled', on ? 'true' : 'false');
        idle.classList.toggle('d-none', on);
        busy.classList.toggle('d-none', !on);

        if (on) {
            setProgress(0);
        }
    }

    // the answer is a json list of messages, anything else (a php error, a full page) is a failure
    function parse(response) {
        try {
            var list = JSON.parse(response);

            return Array.isArray(list) && list.length ? list : null;
        } catch (e) {
            return null;
        }
    }

    // a verification code is good for one upload only, the server forgets it after checking it
    function newCaptcha() {
        if (captcha && captchaImg && typeof window.update_kleeja_captcha === 'function') {
            window.update_kleeja_captcha(captchaImg.getAttribute('data-captcha-url'), 'kleeja_code_answer');
        }
    }

    function finish(list) {
        setBusy(false);
        input.value = '';
        newCaptcha();

        if (list) {
            addMessages(list);
        } else {
            showErrors([text('tryAgain', 'Error, try again.')]);
        }
    }

    function upload(files) {
        var data = new FormData();
        var xhr = new XMLHttpRequest();

        data.append('submitr', '1');
        data.append('ajax', '1');

        files.forEach(function (file, i) {
            data.append('file_' + (i + 1) + '_', file);
        });

        if (captcha) {
            data.append('kleeja_code_answer', captcha.value.trim());
        }

        xhr.open('POST', zone.getAttribute('data-action'));

        xhr.upload.addEventListener('progress', function (event) {
            if (event.lengthComputable) {
                setProgress((event.loaded / event.total) * 100);
            }
        });

        xhr.addEventListener('load', function () {
            finish(xhr.status >= 200 && xhr.status < 300 ? parse(xhr.responseText) : null);
        });

        xhr.addEventListener('error', function () {
            finish(null);
        });

        xhr.addEventListener('abort', function () {
            finish(null);
        });

        setBusy(true);
        xhr.send(data);
    }

    function handleFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        var found = [];
        var valid = [];

        if (uploading || !files.length) {
            return;
        }

        clearOldErrors();

        files.forEach(function (file) {
            var error = checkFile(file);

            if (error) {
                found.push(error);
            } else {
                valid.push(file);
            }
        });

        // the server takes as many files at once as the upload form has fields
        if (valid.length > maxFiles) {
            valid = valid.slice(0, maxFiles);
            found.push(text('tooManyFiles', 'This is the final limit for input fields') + ' (' + maxFiles + ')');
        }

        if (valid.length && captcha && !captcha.value.trim()) {
            valid = [];
            found.push(text('wrongCode', 'Incorrect security code!'));
            captcha.focus();
        }

        showErrors(found);

        if (valid.length) {
            upload(valid);
        }
    }

    function openPicker() {
        if (!uploading) {
            input.click();
        }
    }

    // only drags that carry files, so text can still be dragged into fields
    function hasFiles(event) {
        var types = event.dataTransfer && event.dataTransfer.types;

        return !!types && Array.prototype.indexOf.call(types, 'Files') !== -1;
    }

    zone.addEventListener('click', openPicker);

    zone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
        }
    });

    input.addEventListener('change', function () {
        handleFiles(input.files);
    });

    zone.addEventListener('dragenter', function (event) {
        if (!hasFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepth++;
        zone.classList.add('is-dragover');
    });

    zone.addEventListener('dragover', function (event) {
        if (!hasFiles(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = uploading ? 'none' : 'copy';
    });

    // dragleave fires for every child of the zone too, so count the levels
    zone.addEventListener('dragleave', function () {
        dragDepth = Math.max(0, dragDepth - 1);

        if (dragDepth === 0) {
            zone.classList.remove('is-dragover');
        }
    });

    zone.addEventListener('drop', function (event) {
        if (!hasFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepth = 0;
        zone.classList.remove('is-dragover');
        handleFiles(event.dataTransfer.files);
    });

    // a file dropped next to the zone would open in the browser and leave the page
    ['dragover', 'drop'].forEach(function (type) {
        document.addEventListener(type, function (event) {
            if (hasFiles(event) && !zone.contains(event.target)) {
                event.preventDefault();

                if (type === 'dragover') {
                    event.dataTransfer.dropEffect = 'none';
                }
            }
        });
    });
})();
