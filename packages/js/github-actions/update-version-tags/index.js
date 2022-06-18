const semver = require( 'semver' );
const core = require('@actions/core');
const github = require( '@actions/github' );

function toTag( tagName ) {
	// A leading 'v' is stripped off.
	const version = semver.valid( tagName );

	if ( version === null ) {
		return false;
	}

	// const { major, minor, prerelease } = semver.parse( version );
	// const versions = [ major ];
	// const tagItems = [ versions ];

	// if ( version !== tagName ) {
	// 	tagItems.unshift( 'v' );
	// }

	// if ( prerelease.length ) {
	// 	tagItems.push( '-', prerelease.join( '.' ) );
	// }

	// const majorTag = tagItems.flat().join( '' );

	// versions.push( '.', minor );

	// const minorTag = tagItems.flat().join( '' );

	// return {
	// 	majorTag,
	// 	minorTag,
	// };

	return {
		majorTag: tagName.replace( /(\d+)\.\d+\.\d+/, '$1' ),
		minorTag: tagName.replace( /(\d+\.\d+)\.\d+/, '$1' ),
	};
}

class RepoTool {
	constructor( token, context ) {
		this.context = context;
		this.octokit = github.getOctokit( token );
		this.git = this.octokit.rest.git;
	}

	async hasRef( ref ) {
		try {
			await this.git.getRef( {
				...this.context.repo,
				ref,
			} );
		} catch ( response ) {
			if ( response.status === 404 ) {
				return false;
			}
			throw response;
		}
		return true;
	}

	updateRef( ref, sha ) {
		return this.git.updateRef( {
			...this.context.repo,
			ref,
			sha,
			force: true,
		} );
	}

	async upsertRef( ref, sha ) {
		if ( await this.hasRef( ref ) ) {
			return this.updateRef( ref, sha );
		}

		return this.git.createRef( {
			...this.context.repo,
			ref: `refs/${ ref }`,
			sha,
		} );
	}
}

async function run() {
	const { context } = github;
console.log( context.payload )
const release = context.payload.release || JSON.parse( core.getInput( 'release' ) );
console.log( release )
return;
	const tagName = context.payload.release.tag_name;

	const token = core.getInput( 'repo-token' );
	const sha = core.getInput( 'sha' ) || context.sha;

	core.info( `Release tag: ${ tagName }` );
	core.info( `Target sha: ${ sha }` );

	const repoTool = new RepoTool( token, context );
	const { majorTag, minorTag } = toTag( tagName );

	if ( sha !== context.sha ) {
		core.info( `Updating release version tag: ${ tagName }` );
		await repoTool.updateRef( `tags/${ tagName }`, sha );
	}

	const { draft, prerelease } = context.payload.release;

	if ( draft || prerelease ) {
		core.notice( `Skip major and minor version tags updating for draft or pre-release` );
		return;
	}

	core.info( `Updating major version tag: ${ majorTag }` );
	await repoTool.upsertRef( `tags/${ majorTag }`, sha );

	core.info( `Updating minor version tag: ${ minorTag }` );
	await repoTool.upsertRef( `tags/${ minorTag }`, sha );
}

run().catch( ( e ) => {
	let message;

	if ( e instanceof Error ) {
		message = `${ e.name } - ${ e.message }`;

		if ( e.stack ) {
			core.startGroup( 'Call stack' );
			core.info( e.stack );
			core.endGroup();
		}
	} else {
		message = JSON.stringify( e, null, 2 );
	}

	core.setFailed(`Action failed with error: ${ message }`);
} );

