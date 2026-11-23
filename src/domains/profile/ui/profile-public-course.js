import { showToast } from '../../../utils/toast.js';
import { t } from '../../../utils/i18n.js';
import { showConfirm } from '../../../utils/confirm-dialog.js';
import { publishableStops } from '../../itinerary/services/public-course.mjs';
import { getPublicCourse, publishCourse, unpublishCourse } from '../../itinerary/services/public-course-service.js';
import { checkedVisitorInfo } from '../../itinerary/services/public-route.mjs';
import { getPublicRouteUrl } from '../../itinerary/services/share-links.js';

function makeField(key, type, value = '') {
    const label = document.createElement('label'); label.textContent = t(key);
    const input = document.createElement('input'); input.type = type; input.value = value;
    input.setAttribute('aria-label', t(key)); label.append(input);
    return { label, input };
}

function routeLink(id) {
    const link = document.createElement('a'); link.href = getPublicRouteUrl(id); link.textContent = t('publicRoutePageLink');
    return link;
}

/** 장소 하나의 체크박스와 방문자 정보 입력란을 만든다. */
function stopOption(stop, existing) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = !existing || existing.stops.some(saved => saved.name === stop.name && saved.location === stop.location);
    input._stop = stop;
    const description = document.createElement('span');
    description.textContent = `${stop.name} · ${stop.location}`;
    label.append(input, description);
    const previous = existing?.stops.find(saved => saved.name === stop.name && saved.location === stop.location);
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = t('publicRouteVisitorDetails');
    const name = makeField('publicRouteEnglishPlaceName', 'text', previous?.englishName); name.input.maxLength = 100;
    const selects = {};
    for (const [key, labelKey, choices] of [
        ['englishMenu', 'publicRouteEnglishMenu', ['unknown', 'available', 'unavailable']],
        ['reservation', 'publicRouteReservation', ['unknown', 'required', 'recommended', 'not_required']],
    ]) {
        const selectLabel = document.createElement('label'); selectLabel.textContent = t(labelKey);
        const select = document.createElement('select'); select.setAttribute('aria-label', t(labelKey));
        for (const value of choices) { const option = document.createElement('option'); option.value = value; option.textContent = t(`visitor_${value}`); select.append(option); }
        select.value = previous?.visitorInfo?.[key] || 'unknown'; selects[key] = select;
        selectLabel.append(select); details.append(selectLabel);
    }
    const source = makeField('publicRouteSource', 'url', previous?.visitorInfo?.sourceUrl); source.input.maxLength = 500;
    const date = makeField('publicRouteCheckedOn', 'date', previous?.visitorInfo?.checkedOn);
    const notice = document.createElement('p'); notice.textContent = t('publicRouteSourceNotice');
    details.prepend(summary, name.label); details.append(source.label, date.label, notice);
    input._readStop = () => {
        const visitorInfo = checkedVisitorInfo({ englishMenu: selects.englishMenu.value, reservation: selects.reservation.value,
            sourceUrl: source.input.value.trim(), checkedOn: date.input.value });
        return { ...stop, ...(name.input.value.trim() ? { englishName: name.input.value.trim() } : {}), ...(visitorInfo ? { visitorInfo } : {}) };
    };
    return [label, details];
}

/** 고른 장소를 검사하고 확인을 받은 뒤 공개하는 버튼. */
function publishButton(item, existing, fields, feedback) {
    const { title, titleEn, creditName, creditUrl, review, options } = fields;
    const publish = document.createElement('button');
    publish.type = 'button'; publish.textContent = t(existing ? 'publicCourseUpdate' : 'publicCoursePublish');
    publish.onclick = async () => {
        let selected;
        try { selected = [...options.querySelectorAll('input[type=checkbox]:checked')].map(input => input._readStop()); }
        catch (error) { feedback.textContent = t(error.message); return; }
        if (!title.value.trim() || selected.length < 2) {
            feedback.textContent = t('publicCourseValidation'); return;
        }
        const approved = await showConfirm({ title: t('publicCourseConfirmTitle'), message: t('publicCourseConfirmNotice'), confirmText: t('publicCourseConfirm'), cancelText: t('cancelBtn') });
        if (!approved) return;
        publish.disabled = true;
        try {
            await publishCourse(item.id, { title: title.value, stops: selected, review: review.value,
                titleEn: titleEn.input.value, creditName: creditName.input.value, creditUrl: creditUrl.input.value });
            feedback.textContent = t('publicCourseSaved');
            const link = routeLink(item.id);
            feedback.append(document.createElement('br'), link);
            showToast(t('publicCourseSaved'));
        } catch (error) {
            console.error('Public course publishing failed:', error);
            feedback.textContent = t(error.message === 'publicRouteExtrasInvalid' ? error.message : 'publicCourseFailed');
        } finally { publish.disabled = false; }
    };
    return publish;
}

function unpublishButton(item, editor, feedback) {
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = t('publicCourseUnpublish');
    remove.onclick = async () => {
        const approved = await showConfirm({ title: t('publicCourseUnpublish'), message: t('publicCourseUnpublishNotice'), confirmText: t('publicCourseUnpublish'), cancelText: t('cancelBtn') });
        if (!approved) return;
        remove.disabled = true;
        try { await unpublishCourse(item.id); editor.remove(); showToast(t('publicCourseUnpublished')); }
        catch (error) { console.error('Unpublish failed:', error); feedback.textContent = t('publicCourseFailed'); remove.disabled = false; }
    };
    return remove;
}

/** 저장한 일정 카드 아래에 공개 코스 편집기를 열거나 닫는다. */
export async function editPublicCourse(item, card) {
    const old = card.querySelector('.public-course-editor');
    if (old) { old.remove(); return; }
    const editor = document.createElement('div');
    editor.className = 'public-course-editor';
    editor.textContent = t('publicCourseLoading');
    card.append(editor);
    try {
        const existing = await getPublicCourse(item.id);
        const available = publishableStops(item.itineraryPlan);
        if (available.length < 2 && !existing) {
            editor.textContent = t('publicCourseNotEnough');
            return;
        }
        editor.replaceChildren();
        const notice = document.createElement('p');
        notice.textContent = t('publicCourseNotice');
        const title = document.createElement('input');
        title.type = 'text'; title.maxLength = 60; title.required = true;
        title.placeholder = t('publicCourseTitlePlaceholder');
        title.setAttribute('aria-label', t('publicCourseTitlePlaceholder'));
        title.value = existing?.title || '';
        const titleEn = makeField('publicRouteEnglishTitle', 'text', existing?.titleEn); titleEn.input.maxLength = 100;
        const creditName = makeField('publicRouteCreditName', 'text', existing?.credit?.name); creditName.input.maxLength = 80;
        const creditUrl = makeField('publicRouteCreditUrl', 'url', existing?.credit?.url); creditUrl.input.maxLength = 500;
        const review = document.createElement('textarea');
        review.maxLength = 300;
        review.placeholder = t('publicCourseReviewPlaceholder');
        review.setAttribute('aria-label', t('publicCourseReviewPlaceholder'));
        review.value = existing?.review || '';
        const options = document.createElement('div');
        options.className = 'public-course-options';
        for (const stop of available) options.append(...stopOption(stop, existing));
        const feedback = document.createElement('p');
        feedback.setAttribute('role', 'status');
        const publish = publishButton(item, existing, { title, titleEn, creditName, creditUrl, review, options }, feedback);
        editor.append(notice, title, titleEn.label, creditName.label, creditUrl.label, options, review, publish);
        if (existing) editor.append(routeLink(item.id), unpublishButton(item, editor, feedback));
        editor.append(feedback);
    } catch (error) {
        console.error('Public course loading failed:', error);
        editor.textContent = t('publicCourseFailed');
    }
}
