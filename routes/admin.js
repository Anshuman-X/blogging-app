const express = require("express");
const Blog = require("../models/Blog");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// GET /admin/blogs/pending - Get all pending blogs
router.get("/blogs/pending", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const blogs = await Blog.find({ status: "pending" })
      .populate("author", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("title content author status likesCount commentsCount createdAt");

    const total = await Blog.countDocuments({ status: "pending" });

    res.json({
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch pending blogs error:", error);
    res.status(500).json({ error: "Failed to fetch pending blogs" });
  }
});

// GET /admin/blogs - Get all blogs (for admin management)
router.get("/blogs", async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (
      status &&
      ["pending", "published", "rejected", "hidden"].includes(status)
    ) {
      filter.status = status;
    }

    const blogs = await Blog.find(filter)
      .populate("author", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "title content author status likesCount commentsCount createdAt publishedAt"
      );

    const total = await Blog.countDocuments(filter);

    res.json({
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch admin blogs error:", error);
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});

// POST /admin/blogs/:id/approve - Approve a blog
router.post("/blogs/:id/approve", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "username email"
    );

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    if (blog.status !== "pending") {
      return res.status(400).json({
        error: `Cannot approve blog with status: ${blog.status}. Only pending blogs can be approved.`,
      });
    }

    blog.status = "published";
    blog.publishedAt = new Date();
    await blog.save();

    res.json({
      message: "Blog approved and published successfully",
      blog: {
        id: blog._id,
        title: blog.title,
        author: blog.author,
        status: blog.status,
        publishedAt: blog.publishedAt,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Blog approval error:", error);
    res.status(500).json({ error: "Failed to approve blog" });
  }
});

// POST /admin/blogs/:id/reject - Reject a blog
router.post("/blogs/:id/reject", async (req, res) => {
  try {
    const { reason } = req.body; // Optional rejection reason

    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "username email"
    );

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    if (blog.status !== "pending") {
      return res.status(400).json({
        error: `Cannot reject blog with status: ${blog.status}. Only pending blogs can be rejected.`,
      });
    }

    blog.status = "rejected";
    if (reason) {
      blog.rejectionReason = reason; // You might want to add this field to the schema
    }
    await blog.save();

    res.json({
      message: "Blog rejected successfully",
      blog: {
        id: blog._id,
        title: blog.title,
        author: blog.author,
        status: blog.status,
        reason: reason || null,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Blog rejection error:", error);
    res.status(500).json({ error: "Failed to reject blog" });
  }
});

// POST /admin/blogs/:id/hide - Hide a published blog
router.post("/blogs/:id/hide", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "username email"
    );

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    if (blog.status !== "published") {
      return res.status(400).json({
        error: `Cannot hide blog with status: ${blog.status}. Only published blogs can be hidden.`,
      });
    }

    blog.status = "hidden";
    await blog.save();

    res.json({
      message: "Blog hidden successfully",
      blog: {
        id: blog._id,
        title: blog.title,
        author: blog.author,
        status: blog.status,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Blog hide error:", error);
    res.status(500).json({ error: "Failed to hide blog" });
  }
});

// DELETE /admin/blogs/:id - Delete a blog
router.delete("/blogs/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    await Blog.findByIdAndDelete(req.params.id);

    res.json({
      message: "Blog deleted successfully",
      deletedBlog: {
        id: blog._id,
        title: blog.title,
        status: blog.status,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Blog deletion error:", error);
    res.status(500).json({ error: "Failed to delete blog" });
  }
});

// GET /admin/stats - Get admin dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const stats = await Promise.all([
      Blog.countDocuments({ status: "pending" }),
      Blog.countDocuments({ status: "published" }),
      Blog.countDocuments({ status: "rejected" }),
      Blog.countDocuments({ status: "hidden" }),
      Blog.countDocuments(),
      Blog.aggregate([
        { $match: { status: "published" } },
        { $group: { _id: null, totalLikes: { $sum: { $size: "$likes" } } } },
      ]),
    ]);

    const totalLikes = stats[5][0]?.totalLikes || 0;

    res.json({
      pending: stats[0],
      published: stats[1],
      rejected: stats[2],
      hidden: stats[3],
      total: stats[4],
      totalLikes,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

module.exports = router;
