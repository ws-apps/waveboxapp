import PropTypes from 'prop-types'
import React from 'react'
import MailboxWebViewHibernator from '../MailboxWebViewHibernator'
import CoreService from 'shared/Models/Accounts/CoreService'
import { mailboxDispatch, mailboxStore, mailboxActions, MailboxLinker } from 'stores/mailbox'
import { settingsStore } from 'stores/settings'
import URI from 'urijs'

const REF = 'mailbox_tab'

export default class SlackMailboxWebView extends React.Component {
  /* **************************************************************************/
  // Class
  /* **************************************************************************/

  static propTypes = {
    mailboxId: PropTypes.string.isRequired
  }

  /* **************************************************************************/
  // Component lifecylce
  /* **************************************************************************/

  componentDidMount () {
    mailboxStore.listen(this.mailboxUpdated)
    mailboxDispatch.on('openItem', this.handleOpenItem)
  }

  componentWillUnmount () {
    mailboxStore.unlisten(this.mailboxUpdated)
    mailboxDispatch.removeListener('openItem', this.handleOpenItem)
  }

  componentWillReceiveProps (nextProps) {
    if (this.props.mailboxId !== nextProps.mailboxId) {
      this.setState(this.generateState(nextProps))
    }
  }

  /* **************************************************************************/
  // Data lifecycle
  /* **************************************************************************/

  state = this.generateState(this.props)

  /**
  * Generates the state from the given props
  * @param props: the props to use
  * @return state object
  */
  generateState (props) {
    const { mailboxId } = this.props
    const mailboxState = mailboxStore.getState()
    return {
      mailbox: mailboxState.getMailbox(mailboxId),
      isActive: mailboxState.isActive(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      isSearching: mailboxState.isSearchingMailbox(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      searchTerm: mailboxState.mailboxSearchTerm(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      searchId: mailboxState.mailboxSearchHash(mailboxId, CoreService.SERVICE_TYPES.DEFAULT)
    }
  }

  mailboxUpdated = (mailboxState) => {
    const { mailboxId } = this.props
    this.setState({
      mailbox: mailboxState.getMailbox(mailboxId),
      isActive: mailboxState.isActive(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      isSearching: mailboxState.isSearchingMailbox(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      searchTerm: mailboxState.mailboxSearchTerm(mailboxId, CoreService.SERVICE_TYPES.DEFAULT),
      searchId: mailboxState.mailboxSearchHash(mailboxId, CoreService.SERVICE_TYPES.DEFAULT)
    })
  }

  /* **************************************************************************/
  // Dispatcher Events
  /* **************************************************************************/

  /**
  * Handles opening a new message
  * @param evt: the event that fired
  */
  handleOpenItem = (evt) => {
    if (evt.mailboxId === this.props.mailboxId && evt.service === CoreService.SERVICE_TYPES.DEFAULT) {
      const service = this.state.mailbox.serviceForType(CoreService.SERVICE_TYPES.DEFAULT)
      if (evt.data.launchUri) {
        this.refs[REF].executeJavaScript(`TS.client.handleDeepLink('${evt.data.launchUri}');`)
      } else if (evt.data.channelId) {
        this.refs[REF].executeJavaScript(`TS.client.handleDeepLink('slack://channel?id=${evt.data.channelId}&team=${this.state.mailbox.authTeamId}');`)
      } else {
        this.refs[REF].loadURL(service.url)
      }
    }
  }

  /* **************************************************************************/
  // Browser Events
  /* **************************************************************************/

  /**
  * Opens a new url in the correct way
  * @param evt: the event that fired
  */
  handleOpenNewWindow = (evt) => {
    const url = URI(evt.url)

    if (url.hostname() === 'files.slack.com') {
      this.refs[REF].getWebContents().downloadURL(evt.url)
    } else if (url.hostname().endsWith('.slack.com') && url.pathname().startsWith('/call/')) {
      // Don't put the webPreferences across. It stops it from working. Probably cross frame comms
      MailboxLinker.openContentWindow(this.props.mailboxId, CoreService.SERVICE_TYPES.DEFAULT, evt.url, { ...evt.options, webPreferences: undefined })
    } else {
      MailboxLinker.openExternalWindow(evt.url)
    }
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  componentDidUpdate (prevProps, prevState) {
    // Look for the state change for starting to search or changing search and
    // then try to push that into the slack search in the webview
    if (this.state.isActive) {
      if (this.state.isSearching !== prevState.isSearching || this.state.searchId !== prevState.searchId) {
        if (this.state.isSearching) {
          this.refs[REF].executeJavaScript(`document.querySelector('[name="q"]').focus()`)
          mailboxActions.untrackSearchingMailbox.defer(this.props.mailboxId, CoreService.SERVICE_TYPES.DEFAULT)
        }
      }
    }
  }

  render () {
    const { mailboxId } = this.props

    return (
      <MailboxWebViewHibernator
        ref={REF}
        preload={window.guestResolve('slackDefaultServiceTooling')}
        mailboxId={mailboxId}
        hasSearch={false}
        serviceType={CoreService.SERVICE_TYPES.DEFAULT}
        newWindow={settingsStore.getState().launched.app.useExperimentalWindowOpener ? undefined : this.handleOpenNewWindow} />
    )
  }
}
