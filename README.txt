DEPLOY ON NETLIFY (leaderboard needs the function, so use Git or the CLI):

Option A: Netlify CLI
  npm i -g netlify-cli
  cd this-folder && npm install
  netlify deploy --prod      (first time: netlify login, then create/link a site)

Option B: GitHub
  Push this folder to a GitHub repo, then Netlify > Add new site > Import from Git.
  Leave the build command empty and publish directory as "." (the netlify/functions folder is picked up automatically).

Then open your .netlify.app link. To preview the free-skip claim box, add #test to the URL (https://yoursite.netlify.app/#test).
