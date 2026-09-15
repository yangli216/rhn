package com.rhn.outpatient.architecturefixtures;

import com.rhn.platform.identityaccess.infrastructure.UserAccountRepository;

/** Deliberately invalid dependency, imported only by architecture gate regression tests. */
class InternalAccessFixture {
    UserAccountRepository users;
}
