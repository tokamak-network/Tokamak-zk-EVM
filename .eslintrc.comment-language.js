// ESLint configuration for enforcing English-only comments
module.exports = {
  plugins: ['@typescript-eslint'],
  rules: {
    // Custom rule to detect non-English comments (Korean characters)
    'no-korean-comments': 'error',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      rules: {
        // Enforce English-only comments
        'spaced-comment': [
          'error',
          'always',
          {
            markers: ['/'],
            exceptions: ['-', '+', '*'],
          },
        ],
      },
    },
  ],
};

// Custom ESLint rule definition
const noKoreanComments = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Korean characters in comments',
      category: 'Stylistic Issues',
      recommended: false,
    },
    fixable: null,
    schema: [],
    messages: {
      koreanComment:
        'Comments must be written in English only. Korean characters detected: "{{comment}}"',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      Program() {
        const comments = sourceCode.getAllComments();

        comments.forEach((comment) => {
          const commentText = comment.value.trim();

          // Check for Korean characters (Hangul)
          const koreanRegex = /[\u3131-\u3163\uac00-\ud7a3]/;

          if (koreanRegex.test(commentText)) {
            context.report({
              node: comment,
              messageId: 'koreanComment',
              data: {
                comment:
                  commentText.substring(0, 50) +
                  (commentText.length > 50 ? '...' : ''),
              },
            });
          }
        });
      },
    };
  },
};

// Export the custom rule
module.exports.rules = {
  'no-korean-comments': noKoreanComments,
};
