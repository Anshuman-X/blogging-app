const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      minlength: [10, "Content must be at least 10 characters long"],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "published", "rejected", "hidden"],
      default: "pending",
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ author: 1 });

// Virtual for likes count
blogSchema.virtual("likesCount").get(function () {
  return this.likes.length;
});

// Ensure virtual fields are serialized
blogSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Blog", blogSchema);
