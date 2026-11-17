import mongoose from 'mongoose';

const resumeItemSchema = new mongoose.Schema({
  job_title: { type: String, required: true, trim: true, maxlength: 100 },
  start_year: { type: Number, required: true, min: 1900, max: 2100, validate: Number.isInteger },
  end_year: { type: Number, min: 1900, max: 2100, validate: Number.isInteger },
  employer: { type: String, required: true, trim: true, maxlength: 100 },
  accomplishment: { type: String, required: true, trim: true, maxlength: 1000 },
  image: { type: String, match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/ }
}, { collection: 'resume_items', autoIndex: false });

export const ResumeItem = mongoose.models.ResumeItem || mongoose.model('ResumeItem', resumeItemSchema);
