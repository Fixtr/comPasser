async function deletePublicationReviews(db, courseId, courseCreatedAt) {
  if (!courseCreatedAt) return;
  // Match the deleted publication so a quick republish never loses new reviews.
  for (;;) {
    const snapshot = await db.collection('course_reviews').where('courseId', '==', courseId)
      .where('courseCreatedAt', '==', courseCreatedAt).limit(400).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

module.exports = { deletePublicationReviews };
