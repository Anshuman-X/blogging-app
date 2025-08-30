const express = require("express");
const Blog = require("../models/Blog");
const { authenticateToken, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// POST /blogs - Create a new blog (authenticated users only)
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const blog = new Blog({
      title,
      content,
      author: req.user._id,
      status: "pending",
    });

    await blog.save();
    await blog.populate("author", "username email");

    res.status(201).json({
      message: "Blog created successfully and submitted for review",
      blog: {
        id: blog._id,
        title: blog.title,
        content: blog.content,
        author: blog.author,
        status: blog.status,
        likesCount: blog.likesCount,
        commentsCount: blog.commentsCount,
        createdAt: blog.createdAt,
      },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: errors.join(", ") });
    }

    console.error("Blog creation error:", error);
    res.status(500).json({ error: "Failed to create blog" });
  }
});

// GET /blogs - Get all published blogs (public)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = "latest" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    let sortOptions = {};
    switch (sort) {
      case "latest":
        sortOptions = { publishedAt: -1 };
        break;
      case "oldest":
        sortOptions = { publishedAt: 1 };
        break;
      case "popular":
        sortOptions = { likes: -1 };
        break;
      default:
        sortOptions = { publishedAt: -1 };
    }

    const blogs = await Blog.find({ status: "published" })
      .populate("author", "username")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "title content author status likesCount commentsCount publishedAt createdAt likes"
      );

    const total = await Blog.countDocuments({ status: "published" });

    // If user is authenticated, check which blogs they've liked
    const blogsWithLikeStatus = blogs.map((blog) => {
      const blogObj = blog.toJSON();
      if (req.user) {
        blogObj.isLikedByCurrentUser = blog.likes.includes(req.user._id);
      }
      // Remove the likes array from response for cleaner data
      delete blogObj.likes;
      return blogObj;
    });

    res.json({
      blogs: blogsWithLikeStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Fetch blogs error:", error);
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
});

// GET /blogs/:id - Get single blog by ID (public)
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "username email"
    );

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    // Only allow published blogs to be viewed publicly
    // (unless it's the author or an admin viewing their own content)
    if (blog.status !== "published") {
      if (
        !req.user ||
        (req.user._id.toString() !== blog.author._id.toString() &&
          req.user.role !== "admin")
      ) {
        return res.status(404).json({ error: "Blog not found" });
      }
    }

    const blogResponse = {
      id: blog._id,
      title: blog.title,
      content: blog.content,
      author: blog.author,
      status: blog.status,
      likesCount: blog.likesCount,
      commentsCount: blog.commentsCount,
      publishedAt: blog.publishedAt,
      createdAt: blog.createdAt,
    };

    // Add like status if user is authenticated
    if (req.user) {
      blogResponse.isLikedByCurrentUser = blog.likes.includes(req.user._id);
    }

    res.json({ blog: blogResponse });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Fetch blog error:", error);
    res.status(500).json({ error: "Failed to fetch blog" });
  }
});

// POST /blogs/:id/like - Toggle like on a blog (authenticated users only)
router.post("/:id/like", authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found" });
    }

    // Only allow liking published blogs
    if (blog.status !== "published") {
      return res.status(400).json({ error: "Can only like published blogs" });
    }

    const userId = req.user._id;
    const isLiked = blog.likes.includes(userId);

    if (isLiked) {
      // Unlike the blog
      blog.likes = blog.likes.filter((id) => !id.equals(userId));
    } else {
      // Like the blog
      blog.likes.push(userId);
    }

    await blog.save();

    res.json({
      message: isLiked ? "Blog unliked" : "Blog liked",
      isLiked: !isLiked,
      likesCount: blog.likesCount,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ error: "Blog not found" });
    }

    console.error("Like toggle error:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

module.exports = router;
